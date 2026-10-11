import React, { useState } from 'react';
import { Task, WorkspaceMember } from './boardTypes';
import { X, Calendar, User, AlertCircle, Clock, Trash2 } from 'lucide-react';

interface TaskDetailsModalProps {
  task: Task;
  members: WorkspaceMember[];
  isViewer: boolean;
  isOffline: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, version: number, updates: Partial<Task>) => Promise<void>;
  onArchive: (taskId: string) => Promise<void>;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  task,
  members,
  isViewer,
  isOffline,
  onClose,
  onUpdate,
  onArchive,
}) => {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>(task.priority);
  const [dueDate, setDueDate] = useState<string>(task.due_date ? task.due_date.slice(0, 10) : '');
  const [assigneeId, setAssigneeId] = useState<string>(task.assignee_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      setError('Title cannot be empty');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onUpdate(task.id, task.version, {
        title: title.trim(),
        description,
        priority,
        due_date: dueDate || null,
        assignee_id: assigneeId || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this task?')) return;
    setSaving(true);
    try {
      await onArchive(task.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to archive task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="task-details-modal">
      <div className="modal-card" style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
              }}
              data-testid="task-version-badge"
            >
              v{task.version}
            </span>
            {isViewer && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                (Read Only)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            data-testid="btn-close-task-modal"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            data-testid="task-edit-error"
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              border: '1px solid var(--color-offline)',
              color: 'var(--color-offline)',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', paddingRight: '4px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Title
            </label>
            <input
              type="text"
              className="input-field"
              value={title}
              disabled={isViewer || isOffline || saving}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              data-testid="input-task-title"
              style={{ margin: 0 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Description
            </label>
            <textarea
              className="input-field"
              rows={4}
              value={description}
              disabled={isViewer || isOffline || saving}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add plain-text task description..."
              data-testid="input-task-desc"
              style={{ margin: 0, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                <Clock size={14} /> Priority
              </label>
              <select
                className="input-field"
                value={priority}
                disabled={isViewer || isOffline || saving}
                onChange={(e) => setPriority(e.target.value as any)}
                data-testid="select-task-priority"
                style={{ margin: 0 }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                <Calendar size={14} /> Due Date
              </label>
              <input
                type="date"
                className="input-field"
                value={dueDate}
                disabled={isViewer || isOffline || saving}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="input-task-due-date"
                style={{ margin: 0 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              <User size={14} /> Assignee (Workspace Members Only)
            </label>
            <select
              className="input-field"
              value={assigneeId}
              disabled={isViewer || isOffline || saving}
              onChange={(e) => setAssigneeId(e.target.value)}
              data-testid="select-task-assignee"
              style={{ margin: 0 }}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            {!isViewer && !task.archived ? (
              <button
                type="button"
                onClick={handleArchive}
                disabled={isOffline || saving}
                data-testid="btn-archive-task"
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--color-offline)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Trash2 size={14} /> Archive Task
              </button>
            ) : <div />}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              {!isViewer && (
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isOffline || saving}
                  data-testid="btn-save-task-details"
                  style={{ width: 'auto' }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
