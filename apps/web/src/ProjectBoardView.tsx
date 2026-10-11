import React, { useState, useEffect, useRef } from 'react';
import { BoardSummary, BoardColumn, Task, WorkspaceMember } from './boardTypes';
import { TaskDetailsModal } from './TaskDetailsModal';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  Archive,
  RotateCcw,
  WifiOff,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface ProjectBoardViewProps {
  boardId: string;
  workspaceId: string;
  isOwner: boolean;
  isViewer: boolean;
  members: WorkspaceMember[];
  onBackToBoards?: () => void;
}

export const ProjectBoardView: React.FC<ProjectBoardViewProps> = ({
  boardId,
  isViewer,
  members,
}) => {
  const [board, setBoard] = useState<BoardSummary | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Task Details Modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // New Column Modal / Inline
  const [newColTitle, setNewColTitle] = useState('');
  const [showNewColModal, setShowNewColModal] = useState(false);

  // New Task Modal / Quick Add
  const [activeNewTaskColId, setActiveNewTaskColId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  // Rename Board State
  const [isRenamingBoard, setIsRenamingBoard] = useState(false);
  const [renameBoardTitle, setRenameBoardTitle] = useState('');

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Sequence tracking to detect missed events
  const lastSeqRef = useRef<number>(0);

  // Fetch authoritative board state
  const fetchBoard = async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setBoard(data.board);
        setColumns(data.columns || []);
        setTasks(data.tasks || []);
        setRenameBoardTitle(data.board.title);
      }
    } catch (err) {
      console.error('Failed to fetch board details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard();
  }, [boardId]);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchBoard(); // Reload authoritative state on reconnect
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [boardId]);

  // Real-time SSE Stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      if (isOffline) return;
      eventSource = new EventSource(`/api/boards/${boardId}/events`, { withCredentials: true });

      eventSource.onopen = () => {
        // Connected
      };

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.seq && event.seq > lastSeqRef.current + 1 && lastSeqRef.current !== 0) {
            // Gap detected: reload authoritative state
            fetchBoard();
          }
          if (event.seq) {
            lastSeqRef.current = event.seq;
          }

          // Handle event types
          switch (event.type) {
            case 'board:renamed':
              setBoard((prev) => (prev ? { ...prev, title: event.payload.title } : prev));
              break;
            case 'column:created':
              setColumns((prev) => [...prev, event.payload].sort((a, b) => a.position - b.position));
              break;
            case 'column:renamed':
              setColumns((prev) =>
                prev.map((c) => (c.id === event.entityId ? { ...c, title: event.payload.title } : c))
              );
              break;
            case 'column:reordered':
              setColumns(event.payload.columns);
              break;
            case 'column:deleted':
              setColumns((prev) => prev.filter((c) => c.id !== event.entityId));
              break;
            case 'task:created':
              setTasks((prev) => {
                // If task already exists by id, ignore
                if (prev.some((t) => t.id === event.entityId)) return prev;
                // If there's an optimistic task with matching clientRequestId, replace it
                const clientReqId = event.payload.client_request_id;
                if (clientReqId && prev.some((t) => (t as any).clientRequestId === clientReqId)) {
                  return prev.map((t) => ((t as any).clientRequestId === clientReqId ? event.payload : t));
                }
                // If there's an optimistic task with tempId and matching title & column_id, replace it
                const matchTemp = prev.find((t) => t.id.startsWith('temp-') && t.title === event.payload.title && t.column_id === event.payload.column_id);
                if (matchTemp) {
                  return prev.map((t) => (t.id === matchTemp.id ? event.payload : t));
                }
                return [...prev, event.payload];
              });
              break;
            case 'task:updated':
              setTasks((prev) =>
                prev.map((t) => (t.id === event.entityId ? { ...t, ...event.payload } : t))
              );
              if (selectedTask && selectedTask.id === event.entityId) {
                setSelectedTask(event.payload);
              }
              break;
            case 'task:moved':
              setTasks((prev) =>
                prev.map((t) => (t.id === event.entityId ? event.payload.task : t))
              );
              fetchBoard(); // Refresh full ordering
              break;
            case 'task:archived':
              setTasks((prev) =>
                prev.map((t) => (t.id === event.entityId ? { ...t, archived: true } : t))
              );
              break;
            case 'task:restored':
              setTasks((prev) =>
                prev.map((t) => (t.id === event.entityId ? event.payload : t))
              );
              break;
            default:
              break;
          }
        } catch (_err) {
          // ignore parse errors
        }
      };

      eventSource.addEventListener('error', (e: any) => {
        if (eventSource) {
          eventSource.close();
        }
        // If data says revoked or access revoked, do not reconnect
        if (e?.data && (e.data.includes('revoked') || e.data.includes('revocation'))) {
          return;
        }
        // Attempt reconnect after delay if online
        reconnectTimeout = setTimeout(async () => {
          if (!isOffline) {
            // Verify access before reconnecting
            const check = await fetch(`/api/boards/${boardId}`, {
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              credentials: 'include',
            });
            if (check.ok) {
              fetchBoard();
              connectSSE();
            }
          }
        }, 3000);
      });
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [boardId, isOffline]);

  // Rename Board
  const handleRenameBoardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameBoardTitle.trim() || isOffline) return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ title: renameBoardTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setBoard(data.board);
        setIsRenamingBoard(false);
      }
    } catch (err) {
      console.error('Failed to rename board:', err);
    }
  };

  // Create Column
  const handleCreateColumnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim() || isOffline) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ title: newColTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setColumns((prev) => [...prev, data.column]);
        setNewColTitle('');
        setShowNewColModal(false);
      }
    } catch (err) {
      console.error('Failed to create column:', err);
    }
  };

  // Delete Column
  const handleDeleteColumn = async (columnId: string) => {
    if (isOffline) return;
    if (!confirm('Are you sure you want to delete this column?')) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/columns/${columnId}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete column');
      } else {
        setColumns((prev) => prev.filter((c) => c.id !== columnId));
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting column');
    }
  };

  // Reorder Column (Left / Right)
  const handleMoveColumn = async (columnId: string, currentPos: number, direction: 'left' | 'right') => {
    if (isOffline) return;
    const targetPos = direction === 'left' ? currentPos - 1 : currentPos + 1;
    if (targetPos < 0 || targetPos >= columns.length) return;

    try {
      const res = await fetch(`/api/boards/${boardId}/columns/${columnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ position: targetPos }),
      });
      if (res.ok) {
        const data = await res.json();
        setColumns(data.columns);
      }
    } catch (err) {
      console.error('Failed to reorder column:', err);
    }
  };

  // Create Task with Idempotency Key
  const handleCreateTaskSubmit = async (e: React.FormEvent, columnId: string) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || isOffline) return;

    const clientRequestId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const prevTasks = [...tasks];

    // Optimistic task
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: Task = {
      id: tempId,
      board_id: boardId,
      column_id: columnId,
      title: newTaskTitle.trim(),
      description: '',
      priority: newTaskPriority,
      due_date: null,
      assignee_id: newTaskAssignee || null,
      position: tasks.filter((t) => t.column_id === columnId && !t.archived).length,
      version: 1,
      archived: false,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setTasks((prev) => [...prev, optimisticTask]);
    setNewTaskTitle('');
    setActiveNewTaskColId(null);

    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Idempotency-Key': clientRequestId,
        },
        credentials: 'include',
        body: JSON.stringify({
          title: optimisticTask.title,
          columnId,
          priority: optimisticTask.priority,
          assigneeId: optimisticTask.assignee_id,
          clientRequestId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create task');
      }

      const data = await res.json();
      // Replace optimistic task with committed server task
      setTasks((prev) => prev.map((t) => (t.id === tempId ? data.task : t)));
    } catch (err: any) {
      // Rollback optimistic state
      setTasks(prevTasks);
      alert(err.message || 'Error creating task');
    }
  };

  // Move Task (Drag and drop or keyboard)
  const handleMoveTask = async (taskId: string, targetColId: string, targetPos: number) => {
    if (isOffline) return;
    const taskToMove = tasks.find((t) => t.id === taskId);
    if (!taskToMove) return;

    // Save previous state for rollback
    const prevTasks = [...tasks];

    // Optimistic move
    setTasks((prev) => {
      return prev.map((t) => {
        if (t.id === taskId) {
          return { ...t, column_id: targetColId, position: targetPos };
        }
        return t;
      });
    });

    try {
      const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({
          targetColumnId: targetColId,
          targetPosition: targetPos,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to move task');
      }

      const data = await res.json();
      // Reconcile with authoritative task
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
    } catch (err: any) {
      setTasks(prevTasks);
      alert(err.message || 'Error moving task');
    }
  };

  // Update Task with Optimistic Concurrency Control
  const handleUpdateTask = async (taskId: string, version: number, updates: Partial<Task>) => {
    if (isOffline) throw new Error('Cannot update task while disconnected.');

    const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify({
        version,
        ...updates,
      }),
    });

    const data = await res.json();

    if (res.status === 409) {
      // Conflict! Another user modified the task concurrently
      setConflictMessage('Conflict: This task was modified by another user. Reloading latest task state.');
      if (data.currentTask) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.currentTask : t)));
        setSelectedTask(data.currentTask);
      }
      throw new Error('Conflict: Task was modified by another user. Authoritative state reloaded.');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Failed to update task');
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
  };

  // Archive Task
  const handleArchiveTask = async (taskId: string) => {
    if (isOffline) throw new Error('Cannot archive task while disconnected.');
    const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}/archive`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to archive task');
    }
    const data = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
  };

  // Restore Task
  const handleRestoreTask = async (taskId: string) => {
    if (isOffline) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
      }
    } catch (err) {
      console.error('Failed to restore task:', err);
    }
  };

  // Filtering
  const filteredTasks = tasks.filter((t) => {
    if (showArchived) {
      if (!t.archived) return false;
    } else {
      if (t.archived) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false;
      }
    }

    if (priorityFilter !== 'all' && t.priority !== priorityFilter) {
      return false;
    }

    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned') {
        if (t.assignee_id) return false;
      } else {
        if (t.assignee_id !== assigneeFilter) return false;
      }
    }

    return true;
  });

  if (loading) {
    return (
      <div style={{ padding: '32px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Loading project board...
      </div>
    );
  }

  if (!board) {
    return (
      <div style={{ padding: '32px', color: 'var(--color-offline)', textAlign: 'center' }}>
        Board not found or access denied.
      </div>
    );
  }

  return (
    <div className="board-view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>
      {/* Offline Alert Banner */}
      {isOffline && (
        <div
          data-testid="board-offline-banner"
          style={{
            backgroundColor: 'rgba(210, 153, 34, 0.2)',
            borderBottom: '1px solid var(--color-connecting)',
            color: 'var(--color-connecting)',
            padding: '8px 16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
          }}
        >
          <WifiOff size={16} />
          <span>You are currently offline. Board mutations are disabled until network connection is restored.</span>
        </div>
      )}

      {/* Conflict Alert Banner */}
      {conflictMessage && (
        <div
          data-testid="board-conflict-banner"
          style={{
            backgroundColor: 'rgba(248, 81, 73, 0.2)',
            borderBottom: '1px solid var(--color-offline)',
            color: 'var(--color-offline)',
            padding: '8px 16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{conflictMessage}</span>
          </div>
          <button
            onClick={() => setConflictMessage(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Board Top Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isRenamingBoard ? (
              <form onSubmit={handleRenameBoardSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-field"
                  value={renameBoardTitle}
                  onChange={(e) => setRenameBoardTitle(e.target.value)}
                  autoFocus
                  required
                  data-testid="input-rename-board"
                  style={{ margin: 0, padding: '4px 8px', fontSize: '16px', fontWeight: 600 }}
                />
                <button type="submit" className="btn-primary" data-testid="btn-save-rename-board" style={{ padding: '4px 10px', fontSize: '12px', width: 'auto' }}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenamingBoard(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }} data-testid="board-title-heading">
                  {board.title}
                </h1>
                {!isViewer && (
                  <button
                    onClick={() => setIsRenamingBoard(true)}
                    className="btn-icon"
                    title="Rename Board"
                    data-testid="btn-rename-board"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            )}
            {isViewer && (
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                }}
                data-testid="board-role-badge-viewer"
              >
                Viewer (Read-Only)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="btn-icon"
              data-testid="btn-toggle-archived"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: showArchived ? 'var(--bg-tertiary)' : 'transparent',
                color: showArchived ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Archive size={14} />
              <span>{showArchived ? 'Show Active Tasks' : 'Archived Tasks'}</span>
            </button>

            {!isViewer && !showArchived && (
              <button
                onClick={() => setShowNewColModal(true)}
                disabled={isOffline}
                className="btn-primary"
                data-testid="btn-add-column-dialog"
                style={{ width: 'auto', padding: '6px 14px', fontSize: '13px' }}
              >
                <Plus size={14} style={{ marginRight: '4px' }} /> Add Column
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '4px 10px', flex: '1 1 200px' }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-tasks"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '13px',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-dim)" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              data-testid="select-filter-priority"
              className="input-field"
              style={{ margin: 0, padding: '4px 8px', fontSize: '12.5px', width: 'auto' }}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              data-testid="select-filter-assignee"
              className="input-field"
              style={{ margin: 0, padding: '4px 8px', fontSize: '12.5px', width: 'auto' }}
            >
              <option value="all">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board Canvas */}
      <div
        className="kanban-canvas"
        style={{
          flex: 1,
          display: 'flex',
          gap: '16px',
          padding: '20px 24px',
          overflowX: 'auto',
          alignItems: 'flex-start',
        }}
        data-testid="kanban-board-canvas"
      >
        {showArchived ? (
          // Archived Tasks View
          <div data-testid="archived-tasks-drawer" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Archive size={18} /> Archived Tasks ({filteredTasks.length})
              </h2>
              <button
                onClick={() => setShowArchived(false)}
                className="btn-icon"
                data-testid="btn-close-archived"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Back to Board
              </button>
            </div>
            {filteredTasks.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                No archived tasks found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    data-testid="archived-task-card"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }} data-testid="archived-task-title">
                        {task.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Priority: {task.priority} {task.due_date && `• Due: ${task.due_date.slice(0, 10)}`}
                      </div>
                    </div>
                    {!isViewer && (
                      <button
                        onClick={() => handleRestoreTask(task.id)}
                        disabled={isOffline}
                        data-testid="btn-restore-task"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'none',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--accent-blue-hover)',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        <RotateCcw size={14} /> Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // Active Kanban Columns
          columns.map((col, colIndex) => {
            const colTasks = filteredTasks
              .filter((t) => t.column_id === col.id)
              .sort((a, b) => a.position - b.position);

            return (
              <div
                key={col.id}
                className="kanban-column"
                data-testid={`column-card-${colIndex}`}
                data-col-id={col.id}
                style={{
                  width: '320px',
                  minWidth: '320px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '100%',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedTaskId) {
                    handleMoveTask(draggedTaskId, col.id, colTasks.length);
                    setDraggedTaskId(null);
                  }
                }}
              >
                {/* Column Header */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-main)' }} data-testid="column-title-text">
                      {col.title}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                      }}
                      data-testid={`column-task-count-${col.id}`}
                    >
                      {colTasks.length}
                    </span>
                  </div>

                  {!isViewer && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {colIndex > 0 && (
                        <button
                          onClick={() => handleMoveColumn(col.id, col.position, 'left')}
                          className="btn-icon"
                          title="Move column left"
                          data-testid={`btn-move-col-left-${col.id}`}
                          style={{ padding: '2px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                        >
                          <ArrowUp size={12} style={{ transform: 'rotate(-90deg)' }} />
                        </button>
                      )}
                      {colIndex < columns.length - 1 && (
                        <button
                          onClick={() => handleMoveColumn(col.id, col.position, 'right')}
                          className="btn-icon"
                          title="Move column right"
                          data-testid={`btn-move-col-right-${col.id}`}
                          style={{ padding: '2px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                        >
                          <ArrowDown size={12} style={{ transform: 'rotate(-90deg)' }} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteColumn(col.id)}
                        className="btn-icon"
                        title="Delete column"
                        data-testid={`btn-delete-col-${col.id}`}
                        style={{ padding: '2px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Column Tasks List */}
                <div
                  style={{
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    overflowY: 'auto',
                    flex: 1,
                    minHeight: '80px',
                  }}
                  data-testid={`column-tasks-list-${col.id}`}
                >
                  {colTasks.map((task, taskIdx) => (
                    <div
                      key={task.id}
                      draggable={!isViewer && !isOffline}
                      onDragStart={() => setDraggedTaskId(task.id)}
                      data-testid="task-card"
                      data-task-id={task.id}
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '12px',
                        cursor: isViewer ? 'default' : 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-main)', wordBreak: 'break-word' }} data-testid="task-card-title">
                          {task.title}
                        </span>
                        {!isViewer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                            {/* Accessible Keyboard Movement Select */}
                            <select
                              value={task.column_id}
                              onChange={(e) => handleMoveTask(task.id, e.target.value, 0)}
                              data-testid={`select-move-column-${colIndex}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-dim)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                outline: 'none',
                              }}
                              title="Move to column"
                            >
                              {columns.map((c) => (
                                <option key={c.id} value={c.id} style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-main)' }}>
                                  → {c.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {task.description && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {task.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px' }}>
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            backgroundColor:
                              task.priority === 'urgent'
                                ? 'rgba(248, 81, 73, 0.2)'
                                : task.priority === 'high'
                                ? 'rgba(210, 153, 34, 0.2)'
                                : 'var(--bg-tertiary)',
                            color:
                              task.priority === 'urgent'
                                ? 'var(--color-offline)'
                                : task.priority === 'high'
                                ? 'var(--color-connecting)'
                                : 'var(--text-muted)',
                          }}
                          data-testid={`task-priority-${task.priority}`}
                        >
                          {task.priority}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {task.due_date && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-dim)' }}>
                              <Calendar size={11} />
                              {task.due_date.slice(5, 10)}
                            </span>
                          )}

                          {task.assignee_name && (
                            <span
                              style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-main)',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 500,
                              }}
                              data-testid="task-card-assignee"
                            >
                              {task.assignee_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Accessible Keyboard Reorder (Up/Down) within column */}
                      {!isViewer && (
                        <div
                          style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '2px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {taskIdx > 0 && (
                            <button
                              onClick={() => handleMoveTask(task.id, col.id, taskIdx - 1)}
                              className="btn-icon"
                              title="Move task up"
                              data-testid={`btn-move-task-up-${task.id}`}
                              style={{ padding: '2px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                            >
                              <ArrowUp size={12} />
                            </button>
                          )}
                          {taskIdx < colTasks.length - 1 && (
                            <button
                              onClick={() => handleMoveTask(task.id, col.id, taskIdx + 1)}
                              className="btn-icon"
                              title="Move task down"
                              data-testid={`btn-move-task-down-${task.id}`}
                              style={{ padding: '2px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                            >
                              <ArrowDown size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Quick Add Task */}
                  {!isViewer && activeNewTaskColId === col.id ? (
                    <form
                      onSubmit={(e) => handleCreateTaskSubmit(e, col.id)}
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Task title..."
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        autoFocus
                        required
                        data-testid="input-quick-task-title"
                        style={{ margin: 0, padding: '6px 8px', fontSize: '13px' }}
                      />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select
                          className="input-field"
                          value={newTaskPriority}
                          onChange={(e) => setNewTaskPriority(e.target.value as any)}
                          data-testid="select-quick-task-priority"
                          style={{ margin: 0, padding: '4px 6px', fontSize: '12px', flex: 1 }}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <select
                          className="input-field"
                          value={newTaskAssignee}
                          onChange={(e) => setNewTaskAssignee(e.target.value)}
                          data-testid="select-quick-task-assignee"
                          style={{ margin: 0, padding: '4px 6px', fontSize: '12px', flex: 1 }}
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setActiveNewTaskColId(null)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={isOffline || !newTaskTitle.trim()}
                          data-testid="btn-submit-quick-task"
                          style={{ padding: '4px 10px', fontSize: '12px', width: 'auto' }}
                        >
                          Add
                        </button>
                      </div>
                    </form>
                  ) : (
                    !isViewer && (
                      <button
                        onClick={() => {
                          setActiveNewTaskColId(col.id);
                          setNewTaskTitle('');
                        }}
                        disabled={isOffline}
                        className="btn-icon"
                        data-testid={`btn-add-task-col-${colIndex}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--text-muted)',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          fontSize: '12.5px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={14} /> Add task
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Column Modal */}
      {showNewColModal && (
        <div className="modal-overlay" data-testid="create-column-modal">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <h2 className="modal-title">Add Column</h2>
            <form onSubmit={handleCreateColumnSubmit}>
              <input
                type="text"
                className="input-field"
                placeholder="Column name (e.g. In Review)"
                value={newColTitle}
                onChange={(e) => setNewColTitle(e.target.value)}
                autoFocus
                required
                data-testid="input-new-col-title"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewColModal(false)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!newColTitle.trim()}
                  data-testid="btn-submit-create-col"
                  style={{ width: 'auto' }}
                >
                  Create Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          members={members}
          isViewer={isViewer}
          isOffline={isOffline}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
          onArchive={handleArchiveTask}
        />
      )}
    </div>
  );
};
