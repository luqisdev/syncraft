import { DatabaseAdapter } from './db.js';
import { generateId } from './auth.js';
import { boardEventManager } from './board-events.js';

export interface BoardSummary {
  id: string;
  workspace_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  position: number;
  version: number;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function createBoard(
  db: DatabaseAdapter,
  workspaceId: string,
  title: string,
  userId: string
): Promise<{ board: BoardSummary; columns: BoardColumn[] }> {
  return db.withTransaction(async (client) => {
    const boardId = generateId();
    const boardRes = await client.query(
      `INSERT INTO project_boards (id, workspace_id, title, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [boardId, workspaceId, title, userId]
    );
    const board = boardRes.rows[0];

    // Seed default columns: "To Do", "In Progress", "Done"
    const defaultCols = ['To Do', 'In Progress', 'Done'];
    const columns: BoardColumn[] = [];
    for (let i = 0; i < defaultCols.length; i++) {
      const colId = generateId();
      const colRes = await client.query(
        `INSERT INTO board_columns (id, board_id, title, position)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [colId, boardId, defaultCols[i], i]
      );
      columns.push(colRes.rows[0]);
    }

    return { board, columns };
  });
}

export async function getBoardDetails(
  db: DatabaseAdapter,
  boardId: string
): Promise<{ board: BoardSummary; columns: BoardColumn[]; tasks: Task[] } | null> {
  const boardRes = await db.query(`SELECT * FROM project_boards WHERE id = $1`, [boardId]);
  if (boardRes.rows.length === 0) return null;
  const board = boardRes.rows[0];

  const colRes = await db.query(
    `SELECT * FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
    [boardId]
  );

  const tasksRes = await db.query(
    `SELECT t.*, u.name as assignee_name
     FROM tasks t
     LEFT JOIN users u ON t.assignee_id = u.id
     WHERE t.board_id = $1
     ORDER BY t.position ASC, t.created_at ASC`,
    [boardId]
  );

  return {
    board,
    columns: colRes.rows,
    tasks: tasksRes.rows,
  };
}

export async function renameBoard(
  db: DatabaseAdapter,
  boardId: string,
  newTitle: string
): Promise<BoardSummary> {
  const res = await db.query(
    `UPDATE project_boards SET title = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING *`,
    [newTitle, boardId]
  );
  const updated = res.rows[0];
  boardEventManager.broadcast(boardId, 'board:renamed', boardId, { title: newTitle });
  return updated;
}

export async function createColumn(
  db: DatabaseAdapter,
  boardId: string,
  title: string
): Promise<BoardColumn> {
  return db.withTransaction(async (client) => {
    const maxPosRes = await client.query(
      `SELECT COALESCE(MAX(position), -1) as max_pos FROM board_columns WHERE board_id = $1`,
      [boardId]
    );
    const nextPos = parseInt(maxPosRes.rows[0].max_pos, 10) + 1;
    const colId = generateId();

    const res = await client.query(
      `INSERT INTO board_columns (id, board_id, title, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [colId, boardId, title, nextPos]
    );
    const col = res.rows[0];
    boardEventManager.broadcast(boardId, 'column:created', colId, col);
    return col;
  });
}

export async function renameColumn(
  db: DatabaseAdapter,
  boardId: string,
  columnId: string,
  newTitle: string
): Promise<BoardColumn> {
  const res = await db.query(
    `UPDATE board_columns SET title = $1 WHERE id = $2 AND board_id = $3 RETURNING *`,
    [newTitle, columnId, boardId]
  );
  if (res.rows.length === 0) {
    throw new Error('Column not found');
  }
  const col = res.rows[0];
  boardEventManager.broadcast(boardId, 'column:renamed', columnId, { title: newTitle });
  return col;
}

export async function reorderColumn(
  db: DatabaseAdapter,
  boardId: string,
  columnId: string,
  newPosition: number
): Promise<BoardColumn[]> {
  return db.withTransaction(async (client) => {
    const colsRes = await client.query(
      `SELECT * FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
      [boardId]
    );
    const cols = colsRes.rows;
    const targetIdx = cols.findIndex((c: any) => c.id === columnId);
    if (targetIdx === -1) throw new Error('Column not found');

    const [removed] = cols.splice(targetIdx, 1);
    const boundedPos = Math.max(0, Math.min(newPosition, cols.length));
    cols.splice(boundedPos, 0, removed);

    for (let i = 0; i < cols.length; i++) {
      cols[i].position = i;
      await client.query(
        `UPDATE board_columns SET position = $1 WHERE id = $2`,
        [i, cols[i].id]
      );
    }

    boardEventManager.broadcast(boardId, 'column:reordered', columnId, { columns: cols });
    return cols;
  });
}

export async function deleteColumn(
  db: DatabaseAdapter,
  boardId: string,
  columnId: string
): Promise<void> {
  return db.withTransaction(async (client) => {
    // Check if column has active or archived tasks
    const activeRes = await client.query(
      `SELECT COUNT(*) as count FROM tasks WHERE column_id = $1 AND archived = FALSE`,
      [columnId]
    );
    const activeCount = parseInt(activeRes.rows[0].count, 10);

    const archivedRes = await client.query(
      `SELECT COUNT(*) as count FROM tasks WHERE column_id = $1 AND archived = TRUE`,
      [columnId]
    );
    const archivedCount = parseInt(archivedRes.rows[0].count, 10);

    if (activeCount > 0 && archivedCount > 0) {
      throw new Error(`Cannot delete column containing ${activeCount} active task(s) and ${archivedCount} archived task(s). Move active tasks and restore and move archived tasks before deleting this column.`);
    } else if (activeCount > 0) {
      throw new Error(`Cannot delete column containing ${activeCount} active task(s). Move active tasks before deleting this column.`);
    } else if (archivedCount > 0) {
      throw new Error(`Cannot delete column containing ${archivedCount} archived task(s). Restore and move archived tasks to another column before deleting this column.`);
    }

    await client.query(`DELETE FROM board_columns WHERE id = $1 AND board_id = $2`, [columnId, boardId]);

    // Compact remaining columns positions
    const remainingRes = await client.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
      [boardId]
    );
    for (let i = 0; i < remainingRes.rows.length; i++) {
      await client.query(
        `UPDATE board_columns SET position = $1 WHERE id = $2`,
        [i, remainingRes.rows[i].id]
      );
    }

    boardEventManager.broadcast(boardId, 'column:deleted', columnId, { columnId });
  });
}

export async function createTask(
  db: DatabaseAdapter,
  boardId: string,
  workspaceId: string,
  columnId: string,
  taskData: {
    title: string;
    description?: string;
    priority?: string;
    due_date?: string | null;
    assignee_id?: string | null;
  },
  userId: string,
  idempotencyKey?: string
): Promise<{ task: Task; created: boolean }> {
  return db.withTransaction(async (client) => {
    // Idempotency check if key provided
    if (idempotencyKey) {
      const existingKeyRes = await client.query(
        `SELECT task_id FROM idempotency_keys WHERE client_key = $1`,
        [idempotencyKey]
      );
      if (existingKeyRes.rows.length > 0) {
        const existingTaskId = existingKeyRes.rows[0].task_id;
        const existingTaskRes = await client.query(
          `SELECT t.*, u.name as assignee_name
           FROM tasks t
           LEFT JOIN users u ON t.assignee_id = u.id
           WHERE t.id = $1`,
          [existingTaskId]
        );
        if (existingTaskRes.rows.length > 0) {
          return { task: existingTaskRes.rows[0], created: false };
        }
      }
    }

    // Verify column exists on this board
    const colCheck = await client.query(
      `SELECT id FROM board_columns WHERE id = $1 AND board_id = $2`,
      [columnId, boardId]
    );
    if (colCheck.rows.length === 0) {
      throw new Error('Target column does not exist on this board.');
    }

    // Validate assignee if present
    if (taskData.assignee_id) {
      const memberCheck = await client.query(
        `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, taskData.assignee_id]
      );
      if (memberCheck.rows.length === 0) {
        throw new Error('Assignee must be a member of the workspace.');
      }
    }

    const maxPosRes = await client.query(
      `SELECT COALESCE(MAX(position), -1) as max_pos FROM tasks WHERE column_id = $1 AND archived = FALSE`,
      [columnId]
    );
    const nextPos = parseInt(maxPosRes.rows[0].max_pos, 10) + 1;
    const taskId = generateId();

    const priority = ['low', 'medium', 'high', 'urgent'].includes(taskData.priority || '')
      ? taskData.priority
      : 'medium';

    await client.query(
      `INSERT INTO tasks (id, board_id, column_id, title, description, priority, due_date, assignee_id, position, version, archived, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, FALSE, $10)
       RETURNING *`,
      [
        taskId,
        boardId,
        columnId,
        taskData.title.trim(),
        taskData.description || '',
        priority,
        taskData.due_date || null,
        taskData.assignee_id || null,
        nextPos,
        userId,
      ]
    );

    if (idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_keys (client_key, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [idempotencyKey, taskId]
      );
    }

    // Fetch with assignee name
    const fullTaskRes = await client.query(
      `SELECT t.*, u.name as assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.id = $1`,
      [taskId]
    );
    const fullTask = fullTaskRes.rows[0];

    boardEventManager.broadcast(boardId, 'task:created', taskId, fullTask);
    return { task: fullTask, created: true };
  });
}

export async function updateTask(
  db: DatabaseAdapter,
  boardId: string,
  workspaceId: string,
  taskId: string,
  expectedVersion: number,
  updates: {
    title?: string;
    description?: string;
    priority?: string;
    due_date?: string | null;
    assignee_id?: string | null;
  }
): Promise<{ success: boolean; task?: Task; conflict?: boolean; currentTask?: Task }> {
  return db.withTransaction(async (client) => {
    // Lock task for update
    const currentRes = await client.query(
      `SELECT t.*, u.name as assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.id = $1 AND t.board_id = $2
       FOR UPDATE OF t`,
      [taskId, boardId]
    );

    if (currentRes.rows.length === 0) {
      throw new Error('Task not found');
    }
    const currentTask = currentRes.rows[0];

    // Optimistic Concurrency Control
    if (currentTask.version !== expectedVersion) {
      return {
        success: false,
        conflict: true,
        currentTask,
      };
    }

    // Validate assignee if updating
    if (updates.assignee_id !== undefined && updates.assignee_id !== null) {
      const memberCheck = await client.query(
        `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, updates.assignee_id]
      );
      if (memberCheck.rows.length === 0) {
        throw new Error('Assignee must be a member of the workspace.');
      }
    }

    const newTitle = updates.title !== undefined ? updates.title.trim() : currentTask.title;
    const newDesc = updates.description !== undefined ? updates.description : currentTask.description;
    const newPriority = updates.priority !== undefined ? updates.priority : currentTask.priority;
    const newDueDate = updates.due_date !== undefined ? updates.due_date : currentTask.due_date;
    const newAssignee = updates.assignee_id !== undefined ? updates.assignee_id : currentTask.assignee_id;
    const newVersion = currentTask.version + 1;

    await client.query(
      `UPDATE tasks
       SET title = $1, description = $2, priority = $3, due_date = $4, assignee_id = $5,
           version = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [newTitle, newDesc, newPriority, newDueDate, newAssignee, newVersion, taskId]
    );

    const fullTaskRes = await client.query(
      `SELECT t.*, u.name as assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.id = $1`,
      [taskId]
    );
    const updatedTask = fullTaskRes.rows[0];

    boardEventManager.broadcast(boardId, 'task:updated', taskId, updatedTask);
    return { success: true, task: updatedTask };
  });
}

export async function moveTask(
  db: DatabaseAdapter,
  boardId: string,
  taskId: string,
  targetColumnId: string,
  targetPosition: number
): Promise<{ success: boolean; task: Task }> {
  return db.withTransaction(async (client) => {
    // 1. Lock task row
    const taskRes = await client.query(
      `SELECT * FROM tasks WHERE id = $1 AND board_id = $2 FOR UPDATE`,
      [taskId, boardId]
    );
    if (taskRes.rows.length === 0) throw new Error('Task not found');
    const task = taskRes.rows[0];

    const sourceColumnId = task.column_id;
    const oldPosition = task.position;

    // Verify target column exists
    const targetColRes = await client.query(
      `SELECT id FROM board_columns WHERE id = $1 AND board_id = $2`,
      [targetColumnId, boardId]
    );
    if (targetColRes.rows.length === 0) throw new Error('Target column not found');

    if (sourceColumnId === targetColumnId) {
      // Moving within same column
      if (oldPosition === targetPosition) {
        return { success: true, task };
      }

      if (oldPosition < targetPosition) {
        // Shift items between oldPosition + 1 and targetPosition DOWN by 1
        await client.query(
          `UPDATE tasks
           SET position = position - 1
           WHERE column_id = $1 AND archived = FALSE AND position > $2 AND position <= $3`,
          [sourceColumnId, oldPosition, targetPosition]
        );
      } else {
        // Shift items between targetPosition and oldPosition - 1 UP by 1
        await client.query(
          `UPDATE tasks
           SET position = position + 1
           WHERE column_id = $1 AND archived = FALSE AND position >= $2 AND position < $3`,
          [sourceColumnId, targetPosition, oldPosition]
        );
      }

      await client.query(
        `UPDATE tasks
         SET position = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [targetPosition, taskId]
      );
    } else {
      // Moving between columns
      // 1. Shift tasks in source column after oldPosition DOWN by 1
      await client.query(
        `UPDATE tasks
         SET position = position - 1
         WHERE column_id = $1 AND archived = FALSE AND position > $2`,
        [sourceColumnId, oldPosition]
      );

      // 2. Shift tasks in target column at or after targetPosition UP by 1
      await client.query(
        `UPDATE tasks
         SET position = position + 1
         WHERE column_id = $1 AND archived = FALSE AND position >= $2`,
        [targetColumnId, targetPosition]
      );

      // 3. Move task to new column & targetPosition
      await client.query(
        `UPDATE tasks
         SET column_id = $1, position = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [targetColumnId, targetPosition, taskId]
      );
    }

    const updatedTaskRes = await client.query(
      `SELECT t.*, u.name as assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.id = $1`,
      [taskId]
    );
    const updatedTask = updatedTaskRes.rows[0];

    boardEventManager.broadcast(boardId, 'task:moved', taskId, {
      task: updatedTask,
      sourceColumnId,
      targetColumnId,
      targetPosition,
    });

    return { success: true, task: updatedTask };
  });
}

export async function archiveTask(
  db: DatabaseAdapter,
  boardId: string,
  taskId: string
): Promise<Task> {
  return db.withTransaction(async (client) => {
    const taskRes = await client.query(
      `SELECT * FROM tasks WHERE id = $1 AND board_id = $2 FOR UPDATE`,
      [taskId, boardId]
    );
    if (taskRes.rows.length === 0) throw new Error('Task not found');
    const task = taskRes.rows[0];

    // Compact remaining tasks in column
    await client.query(
      `UPDATE tasks SET position = position - 1
       WHERE column_id = $1 AND archived = FALSE AND position > $2`,
      [task.column_id, task.position]
    );

    const updateRes = await client.query(
      `UPDATE tasks
       SET archived = TRUE, position = -1, version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [taskId]
    );
    const archivedTask = updateRes.rows[0];

    boardEventManager.broadcast(boardId, 'task:archived', taskId, archivedTask);
    return archivedTask;
  });
}

export async function restoreTask(
  db: DatabaseAdapter,
  boardId: string,
  taskId: string,
  targetColumnId?: string
): Promise<Task> {
  return db.withTransaction(async (client) => {
    const taskRes = await client.query(
      `SELECT * FROM tasks WHERE id = $1 AND board_id = $2 FOR UPDATE`,
      [taskId, boardId]
    );
    if (taskRes.rows.length === 0) throw new Error('Task not found');
    const task = taskRes.rows[0];

    // If targetColumnId provided, verify it; otherwise use task.column_id if exists or first column
    let colId = targetColumnId || task.column_id;
    const colCheck = await client.query(
      `SELECT id FROM board_columns WHERE id = $1 AND board_id = $2`,
      [colId, boardId]
    );
    if (colCheck.rows.length === 0) {
      const firstCol = await client.query(
        `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC LIMIT 1`,
        [boardId]
      );
      if (firstCol.rows.length === 0) throw new Error('No columns available on board');
      colId = firstCol.rows[0].id;
    }

    const maxPosRes = await client.query(
      `SELECT COALESCE(MAX(position), -1) as max_pos FROM tasks WHERE column_id = $1 AND archived = FALSE`,
      [colId]
    );
    const nextPos = parseInt(maxPosRes.rows[0].max_pos, 10) + 1;

    const updateRes = await client.query(
      `UPDATE tasks
       SET archived = FALSE, column_id = $1, position = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [colId, nextPos, taskId]
    );
    const restoredTask = updateRes.rows[0];

    boardEventManager.broadcast(boardId, 'task:restored', taskId, restoredTask);
    return restoredTask;
  });
}
