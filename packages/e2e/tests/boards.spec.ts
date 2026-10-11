import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import {
  startIsolatedServer,
  validateTestDatabaseUrl,
  TestServerInstance,
} from '../test-server-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const TEST_DB_URL = process.env.TEST_DATABASE_URL || '';
validateTestDatabaseUrl(TEST_DB_URL);

async function cleanTestDatabase(dbUrl: string) {
  validateTestDatabaseUrl(dbUrl);
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('DELETE FROM restore_idempotency_keys');
    await client.query('DELETE FROM document_checkpoints');
    await client.query('DELETE FROM idempotency_keys');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM board_columns');
    await client.query('DELETE FROM project_boards');
    await client.query('DELETE FROM workspace_documents');
    await client.query('DELETE FROM workspace_members');
    await client.query('DELETE FROM workspaces');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM documents');
  } finally {
    await client.end();
  }
}

test.describe('Syncraft Milestone 3: Real-Time Project Boards', () => {
  let testServer: TestServerInstance;
  const TEST_SERVER_PORT = 1234;

  test.beforeAll(async () => {
    testServer = await startIsolatedServer(TEST_SERVER_PORT, TEST_DB_URL);
  });

  test.afterAll(async () => {
    if (testServer) {
      await testServer.stop();
    }
  });

  test.beforeEach(async () => {
    await cleanTestDatabase(TEST_DB_URL);
  });

  test('Create board with default columns, add tasks, and verify persistence after reload', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // Register User Alice
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Alice BoardOwner');
    await page.fill('[data-testid="input-auth-email"]', 'alice-boards@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Switch to Boards Tab
    await page.click('[data-testid="nav-boards-tab"]');
    await expect(page.locator('[data-testid="btn-create-first-board"]')).toBeVisible();

    // Create a new board
    await page.click('[data-testid="btn-create-first-board"]');
    await expect(page.locator('[data-testid="create-board-modal"]')).toBeVisible();
    await page.fill('[data-testid="input-new-board-title"]', 'Sprint Alpha');
    await page.click('[data-testid="btn-submit-create-board"]');

    // Confirm default columns exist: To Do, In Progress, Done
    await expect(page.locator('[data-testid="board-title-heading"]')).toHaveText('Sprint Alpha');
    const columnTitles = page.locator('[data-testid="column-title-text"]');
    await expect(columnTitles.nth(0)).toHaveText('To Do');
    await expect(columnTitles.nth(1)).toHaveText('In Progress');
    await expect(columnTitles.nth(2)).toHaveText('Done');

    // Create a task in 'To Do'
    await page.click('[data-testid="btn-add-task-col-0"]');
    await page.fill('[data-testid="input-quick-task-title"]', 'Build Auth Pipeline');
    await page.selectOption('[data-testid="select-quick-task-priority"]', 'high');
    await page.click('[data-testid="btn-submit-quick-task"]');

    // Verify task card appears
    await expect(page.locator('[data-testid="task-card-title"]').first()).toHaveText('Build Auth Pipeline');
    await expect(page.locator('[data-testid="task-priority-high"]').first()).toBeVisible();

    // Reload page to verify persistence in PostgreSQL
    await page.reload();
    await page.click('[data-testid="nav-boards-tab"]');
    await expect(page.locator('[data-testid="board-title-heading"]')).toHaveText('Sprint Alpha');
    await expect(page.locator('[data-testid="task-card-title"]').first()).toHaveText('Build Auth Pipeline');

    // Verify final state in PostgreSQL
    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    try {
      const boardsRes = await client.query('SELECT * FROM project_boards WHERE title = $1', ['Sprint Alpha']);
      expect(boardsRes.rows.length).toBe(1);
      const tasksRes = await client.query('SELECT * FROM tasks WHERE title = $1', ['Build Auth Pipeline']);
      expect(tasksRes.rows.length).toBe(1);
      expect(tasksRes.rows[0].priority).toBe('high');
      expect(tasksRes.rows[0].position).toBe(0);
      expect(tasksRes.rows[0].version).toBe(1);
    } finally {
      await client.end();
    }

    await context.close();
  });

  test('Update task fields, keyboard move between columns, and archive/restore', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // Register User Bob
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Bob TaskEditor');
    await page.fill('[data-testid="input-auth-email"]', 'bob-editor@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Create board
    await page.click('[data-testid="nav-boards-tab"]');
    await page.click('[data-testid="btn-create-first-board"]');
    await page.fill('[data-testid="input-new-board-title"]', 'Feature Board');
    await page.click('[data-testid="btn-submit-create-board"]');
    await expect(page.locator('[data-testid="board-title-heading"]')).toHaveText('Feature Board');

    // Add task in first column (To Do)
    await page.click('[data-testid="btn-add-task-col-0"]');
    await page.fill('[data-testid="input-quick-task-title"]', 'Database Optimization');
    await page.click('[data-testid="btn-submit-quick-task"]');
    await expect(page.locator('[data-testid="task-card-title"]').first()).toHaveText('Database Optimization');

    // Open task details modal
    await page.locator('[data-testid="task-card"]').first().click();
    await expect(page.locator('[data-testid="task-details-modal"]')).toBeVisible();

    // Edit description, priority, due date, and assignee
    await page.fill('[data-testid="input-task-desc"]', 'Add composite indexes on tasks table.');
    await page.selectOption('[data-testid="select-task-priority"]', 'urgent');
    await page.fill('[data-testid="input-task-due-date"]', '2026-11-15');
    await page.selectOption('[data-testid="select-task-assignee"]', { label: 'Bob TaskEditor (bob-editor@test.com)' });
    await page.click('[data-testid="btn-save-task-details"]');
    await expect(page.locator('[data-testid="task-details-modal"]')).not.toBeVisible();

    // Confirm updated priority badge and assignee on card
    await expect(page.locator('[data-testid="task-priority-urgent"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="task-card-assignee"]').first()).toContainText('Bob TaskEditor');

    // Move task to 'In Progress' using keyboard-accessible move control
    await page.selectOption('[data-testid="select-move-column-0"]', { index: 1 }); // Move to second column (In Progress)
    // Wait for task to appear in column 1
    const col1Tasks = page.locator('[data-testid="column-card-1"] [data-testid="task-card-title"]');
    await expect(col1Tasks.first()).toHaveText('Database Optimization');
    const col0Tasks = page.locator('[data-testid="column-card-0"] [data-testid="task-card-title"]');
    await expect(col0Tasks).toHaveCount(0);

    // Archive task from task details modal
    page.on('dialog', (dialog) => dialog.accept());
    await col1Tasks.first().click();
    await expect(page.locator('[data-testid="task-details-modal"]')).toBeVisible();
    await page.click('[data-testid="btn-archive-task"]');
    await expect(page.locator('[data-testid="task-details-modal"]')).not.toBeVisible();

    // Task is removed from active columns
    await expect(page.locator('[data-testid="task-card"]')).toHaveCount(0);

    // Open Archived Tasks drawer
    await page.click('[data-testid="btn-toggle-archived"]');
    await expect(page.locator('[data-testid="archived-tasks-drawer"]')).toBeVisible();
    await expect(page.locator('[data-testid="archived-task-title"]').first()).toHaveText('Database Optimization');

    // Restore task
    await page.click('[data-testid="btn-restore-task"]');
    await page.click('[data-testid="btn-close-archived"]');

    // Confirm task is restored back to the board
    await expect(page.locator('[data-testid="task-card-title"]').first()).toHaveText('Database Optimization');

    await context.close();
  });

  test('Real-time board synchronization: mutations broadcast to second authenticated browser without reload', async ({ browser }) => {
    // 1. User Alice creates board
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice SyncAdmin');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-sync@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="current-user-name"]')).toBeVisible();

    await pageAlice.click('[data-testid="nav-boards-tab"]');
    await pageAlice.click('[data-testid="btn-create-first-board"]');
    await pageAlice.fill('[data-testid="input-new-board-title"]', 'Live Sync Board');
    await pageAlice.click('[data-testid="btn-submit-create-board"]');
    await expect(pageAlice.locator('[data-testid="board-title-heading"]')).toHaveText('Live Sync Board');

    // 2. User Bob registers and is added as Editor to Alice's workspace
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob Peer');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-peer@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Alice invites Bob as editor
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-peer@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // Bob switches to Alice's workspace
    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice SyncAdmin's Workspace (editor)" });
    await pageBob.click('[data-testid="nav-boards-tab"]');
    await expect(pageBob.locator('[data-testid="board-title-heading"]')).toHaveText('Live Sync Board');

    // 3. Alice adds a task; Bob must see it in real-time WITHOUT reloading
    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Instant SSE Task');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');

    // Bob sees the task automatically
    await expect(pageBob.locator('[data-testid="task-card-title"]').first()).toHaveText('Instant SSE Task');

    // 4. Bob moves the task using keyboard selector; Alice must see it move in real-time
    await pageBob.selectOption('[data-testid="select-move-column-0"]', { index: 2 }); // Move to Done (index 2)
    const aliceDoneTasks = pageAlice.locator('[data-testid="column-card-2"] [data-testid="task-card-title"]');
    await expect(aliceDoneTasks.first()).toHaveText('Instant SSE Task');

    await contextAlice.close();
    await contextBob.close();
  });

  test('Concurrent task edits: optimistic concurrency detects version mismatch and returns 409 conflict', async ({ browser }) => {
    // 1. Setup workspace with Alice and Bob
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice OCC');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-occ@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="nav-boards-tab"]');
    await pageAlice.click('[data-testid="btn-create-first-board"]');
    await pageAlice.fill('[data-testid="input-new-board-title"]', 'Conflict Board');
    await pageAlice.click('[data-testid="btn-submit-create-board"]');

    // Create task
    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Shared Task Spec');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');
    await expect(pageAlice.locator('[data-testid="task-card-title"]').first()).toHaveText('Shared Task Spec');

    // Register Bob and invite to workspace
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob OCC');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-occ@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-occ@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice OCC's Workspace (editor)" });
    await pageBob.click('[data-testid="nav-boards-tab"]');
    await expect(pageBob.locator('[data-testid="task-card-title"]').first()).toHaveText('Shared Task Spec');

    // Both Alice and Bob open the task details modal concurrently
    await pageAlice.locator('[data-testid="task-card"]').first().click();
    await expect(pageAlice.locator('[data-testid="task-details-modal"]')).toBeVisible();

    await pageBob.locator('[data-testid="task-card"]').first().click();
    await expect(pageBob.locator('[data-testid="task-details-modal"]')).toBeVisible();

    // Alice saves first (updates title & bumps version from 1 to 2)
    await pageAlice.fill('[data-testid="input-task-title"]', 'Alice Revised Spec');
    await pageAlice.click('[data-testid="btn-save-task-details"]');
    await expect(pageAlice.locator('[data-testid="task-details-modal"]')).not.toBeVisible();
    await expect(pageAlice.locator('[data-testid="task-card-title"]').first()).toHaveText('Alice Revised Spec');

    // Bob attempts to save his stale edit (which still expects version 1)
    await pageBob.fill('[data-testid="input-task-title"]', 'Bob Conflicting Spec');
    await pageBob.click('[data-testid="btn-save-task-details"]');

    // Bob receives understandable 409 conflict message and can reload authoritative state
    await expect(pageBob.locator('[data-testid="task-edit-error"]')).toContainText('Conflict');

    await contextAlice.close();
    await contextBob.close();
  });

  test('Idempotency key prevents duplicate task creation on network retry', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Charlie Retry');
    await page.fill('[data-testid="input-auth-email"]', 'charlie@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    await page.click('[data-testid="nav-boards-tab"]');
    await page.click('[data-testid="btn-create-first-board"]');
    await page.fill('[data-testid="input-new-board-title"]', 'Idempotent Board');
    await page.click('[data-testid="btn-submit-create-board"]');
    await expect(page.locator('[data-testid="board-title-heading"]')).toHaveText('Idempotent Board');

    // Obtain boardId and columnId via page evaluation
    const boardMeta = await page.evaluate(async () => {
      const res = await fetch('/api/workspaces', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const wsData = await res.json();
      const wsId = wsData.workspaces[0].id;
      const bRes = await fetch(`/api/workspaces/${wsId}/boards`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const bData = await bRes.json();
      const boardId = bData.boards[0].id;
      const detailsRes = await fetch(`/api/boards/${boardId}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const details = await detailsRes.json();
      return { boardId, columnId: details.columns[0].id };
    });

    const clientKey = 'idempotent-test-key-123';

    // Send task creation request with idempotency key
    const result1 = await page.evaluate(async ({ boardId, columnId, clientKey }) => {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          column_id: columnId,
          title: 'Critical Deployment',
          idempotency_key: clientKey,
        }),
      });
      return { status: res.status, body: await res.json() };
    }, { boardId: boardMeta.boardId, columnId: boardMeta.columnId, clientKey });

    expect(result1.status).toBe(201);
    const createdTaskId = result1.body.task.id;

    // Retry exact same request with identical idempotency key
    const result2 = await page.evaluate(async ({ boardId, columnId, clientKey }) => {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          column_id: columnId,
          title: 'Critical Deployment',
          idempotency_key: clientKey,
        }),
      });
      return { status: res.status, body: await res.json() };
    }, { boardId: boardMeta.boardId, columnId: boardMeta.columnId, clientKey });

    // Must return the exact same task without creating a duplicate
    expect(result2.status).toBe(200);
    expect(result2.body.task.id).toBe(createdTaskId);

    // Verify in database that only ONE task exists
    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    try {
      const countRes = await client.query('SELECT COUNT(*) as count FROM tasks WHERE title = $1', ['Critical Deployment']);
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    } finally {
      await client.end();
    }

    await context.close();
  });

  test('Viewer and non-member restrictions: direct requests rejected with 403', async ({ browser }) => {
    // 1. Setup workspace with Alice (owner) and Victor (viewer)
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice BoardPerms');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-perms@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="nav-boards-tab"]');
    await pageAlice.click('[data-testid="btn-create-first-board"]');
    await pageAlice.fill('[data-testid="input-new-board-title"]', 'Strict Board');
    await pageAlice.click('[data-testid="btn-submit-create-board"]');

    const contextVictor = await browser.newContext();
    const pageVictor = await contextVictor.newPage();
    await pageVictor.goto('/');
    await pageVictor.click('[data-testid="btn-toggle-auth-mode"]');
    await pageVictor.fill('[data-testid="input-register-name"]', 'Victor Viewer');
    await pageVictor.fill('[data-testid="input-auth-email"]', 'victor-board@test.com');
    await pageVictor.fill('[data-testid="input-auth-password"]', 'password123');
    await pageVictor.click('[data-testid="btn-auth-submit"]');

    // Add Victor as Viewer
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'victor-board@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'viewer');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // Alice fetches board and column IDs
    const boardMeta = await pageAlice.evaluate(async () => {
      const res = await fetch('/api/workspaces', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const wsData = await res.json();
      const wsId = wsData.workspaces[0].id;
      const bRes = await fetch(`/api/workspaces/${wsId}/boards`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const bData = await bRes.json();
      const boardId = bData.boards[0].id;
      const detailsRes = await fetch(`/api/boards/${boardId}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const details = await detailsRes.json();
      return { boardId, columnId: details.columns[0].id };
    });

    // Victor attempts direct POST /api/boards/:id/tasks mutation -> rejected 403 Forbidden
    const victorPostResult = await pageVictor.evaluate(async ({ boardId, columnId }) => {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ column_id: columnId, title: 'Unauthorized Task' }),
      });
      return { status: res.status };
    }, { boardId: boardMeta.boardId, columnId: boardMeta.columnId });
    expect(victorPostResult.status).toBe(403);

    // Non-member registration
    const contextStranger = await browser.newContext();
    const pageStranger = await contextStranger.newPage();
    await pageStranger.goto('/');
    await pageStranger.click('[data-testid="btn-toggle-auth-mode"]');
    await pageStranger.fill('[data-testid="input-register-name"]', 'Stranger Danger');
    await pageStranger.fill('[data-testid="input-auth-email"]', 'stranger@test.com');
    await pageStranger.fill('[data-testid="input-auth-password"]', 'password123');
    await pageStranger.click('[data-testid="btn-auth-submit"]');
    await expect(pageStranger.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Stranger attempts GET /api/boards/:id -> rejected 403 Forbidden
    const strangerGetResult = await pageStranger.evaluate(async ({ boardId }) => {
      const res = await fetch(`/api/boards/${boardId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return { status: res.status };
    }, { boardId: boardMeta.boardId });
    expect(strangerGetResult.status).toBe(403);

    await contextAlice.close();
    await contextVictor.close();
    await contextStranger.close();
  });

  test('Membership removal terminates active board SSE subscription', async ({ browser }) => {
    // Alice creates board
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Admin');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-remove@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="nav-boards-tab"]');
    await pageAlice.click('[data-testid="btn-create-first-board"]');
    await pageAlice.fill('[data-testid="input-new-board-title"]', 'Revocation Board');
    await pageAlice.click('[data-testid="btn-submit-create-board"]');

    // Bob registers and joins
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob Revokee');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-revokee@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-revokee@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice Admin's Workspace (editor)" });
    await pageBob.click('[data-testid="nav-boards-tab"]');
    await expect(pageBob.locator('[data-testid="board-title-heading"]')).toHaveText('Revocation Board');

    // Alice removes Bob from workspace
    pageAlice.on('dialog', (dialog) => dialog.accept());
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await expect(pageAlice.locator('[data-testid="btn-remove-bob-revokee@test.com"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-remove-bob-revokee@test.com"]');
    await expect(pageAlice.locator('[data-testid="member-row-bob-revokee@test.com"]')).toHaveCount(0);
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // Alice adds a new task
    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Secret Post-Removal Task');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');

    // Wait a brief moment to ensure SSE broadcast would have occurred
    await pageBob.waitForTimeout(1000);

    // Bob MUST NOT receive the new task because his SSE connection was terminated
    await expect(pageBob.locator('[data-testid="task-card-title"]')).toHaveCount(0);

    await contextAlice.close();
    await contextBob.close();
  });

  test('Reject assignment to a user outside the workspace', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice AssignOwner');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-assign@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="nav-boards-tab"]');
    await pageAlice.click('[data-testid="btn-create-first-board"]');
    await pageAlice.fill('[data-testid="input-new-board-title"]', 'Assignee Test Board');
    await pageAlice.click('[data-testid="btn-submit-create-board"]');

    // Register unrelated user Eve
    const contextEve = await browser.newContext();
    const pageEve = await contextEve.newPage();
    await pageEve.goto('/');
    await pageEve.click('[data-testid="btn-toggle-auth-mode"]');
    await pageEve.fill('[data-testid="input-register-name"]', 'Eve Outsider');
    await pageEve.fill('[data-testid="input-auth-email"]', 'eve-outside@test.com');
    await pageEve.fill('[data-testid="input-auth-password"]', 'password123');
    await pageEve.click('[data-testid="btn-auth-submit"]');
    await expect(pageEve.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Eve's user ID from db
    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const eveRes = await client.query('SELECT id FROM users WHERE email = $1', ['eve-outside@test.com']);
    await client.end();
    expect(eveRes.rows.length).toBe(1);
    const eveId = eveRes.rows[0].id;

    // Alice attempts to create or update a task assigned to Eve
    const boardMeta = await pageAlice.evaluate(async () => {
      const res = await fetch('/api/workspaces', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const wsData = await res.json();
      const wsId = wsData.workspaces[0].id;
      const bRes = await fetch(`/api/workspaces/${wsId}/boards`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const bData = await bRes.json();
      const boardId = bData.boards[0].id;
      const detailsRes = await fetch(`/api/boards/${boardId}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const details = await detailsRes.json();
      return { boardId, columnId: details.columns[0].id };
    });

    const assignResult = await pageAlice.evaluate(async ({ boardId, columnId, outsiderId }) => {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          column_id: columnId,
          title: 'Illegal Assignee Task',
          assignee_id: outsiderId,
        }),
      });
      return { status: res.status, body: await res.json() };
    }, { boardId: boardMeta.boardId, columnId: boardMeta.columnId, outsiderId: eveId });

    // Server must reject with 400 Bad Request
    expect(assignResult.status).toBe(400);
    expect(assignResult.body.error).toContain('Assignee must be a member of the workspace');

    await contextAlice.close();
    await contextEve.close();
  });

  test('Board disconnection and reconnection recovers missed events and restores authoritative state', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // Register user
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Recon User');
    await page.fill('[data-testid="input-auth-email"]', 'recon@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    await page.click('[data-testid="nav-boards-tab"]');
    await page.click('[data-testid="btn-create-first-board"]');
    await page.fill('[data-testid="input-new-board-title"]', 'Reconnection Board');
    await page.click('[data-testid="btn-submit-create-board"]');
    await expect(page.locator('[data-testid="board-title-heading"]')).toHaveText('Reconnection Board');

    // Add initial task
    await page.click('[data-testid="btn-add-task-col-0"]');
    await page.fill('[data-testid="input-quick-task-title"]', 'Initial Task 1');
    await page.click('[data-testid="btn-submit-quick-task"]');
    await expect(page.locator('[data-testid="task-card-title"]')).toHaveText(['Initial Task 1']);

    // Simulate going offline
    await context.setOffline(true);
    // Offline banner must appear and mutation actions disabled
    await expect(page.locator('[data-testid="board-offline-banner"]')).toBeVisible();

    // While client was offline, another mutation was committed directly on server/database
    const boardMeta = await page.evaluate(async () => {
      // Get board and column IDs from local elements or state
      const titleEl = document.querySelector('[data-testid="board-title-heading"]');
      return titleEl ? true : false;
    });
    expect(boardMeta).toBe(true);

    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const bRes = await client.query(`SELECT id FROM project_boards WHERE title = $1`, ['Reconnection Board']);
    const boardId = bRes.rows[0].id;
    const colRes = await client.query(`SELECT id FROM board_columns WHERE board_id = $1 AND position = 0`, [boardId]);
    const colId = colRes.rows[0].id;
    // Insert a task missed while offline
    await client.query(
      `INSERT INTO tasks (id, board_id, column_id, title, position, version, archived)
       VALUES ($1, $2, $3, $4, 1, 1, FALSE)`,
      ['missed-task-id', boardId, colId, 'Missed Server Task']
    );
    await client.end();

    // Now restore connection
    await context.setOffline(false);
    await expect(page.locator('[data-testid="board-offline-banner"]')).toHaveCount(0);

    // On reconnect, authoritative board state is refetched and missed task appears
    await expect(page.locator('[data-testid="task-card-title"]')).toContainText(['Missed Server Task']);

    await context.close();
  });

  test('Archived task prevents column deletion with actionable message and restores safely', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'ColArchive User');
    await page.fill('[data-testid="input-auth-email"]', 'col-archive@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    await page.click('[data-testid="nav-boards-tab"]');
    await page.click('[data-testid="btn-create-first-board"]');
    await page.fill('[data-testid="input-new-board-title"]', 'Column Guard Board');
    await page.click('[data-testid="btn-submit-create-board"]');

    // Create a task in 'To Do' (column 0)
    await page.click('[data-testid="btn-add-task-col-0"]');
    await page.fill('[data-testid="input-quick-task-title"]', 'Task to Archive');
    await page.click('[data-testid="btn-submit-quick-task"]');
    await expect(page.locator('[data-testid="task-card-title"]')).toHaveText(['Task to Archive']);

    // Archive the task via task details modal
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('[data-testid="task-card"]').first().click();
    await expect(page.locator('[data-testid="task-details-modal"]')).toBeVisible();
    await page.click('[data-testid="btn-archive-task"]');
    await expect(page.locator('[data-testid="task-details-modal"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="task-card"]')).toHaveCount(0);

    // Now attempt to delete Column 0 via API
    const boardMeta = await page.evaluate(async () => {
      const res = await fetch('/api/workspaces', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const wsData = await res.json();
      const wsId = wsData.workspaces[0].id;
      const bRes = await fetch(`/api/workspaces/${wsId}/boards`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const bData = await bRes.json();
      const boardId = bData.boards[0].id;
      const detailsRes = await fetch(`/api/boards/${boardId}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const details = await detailsRes.json();
      return { boardId, columnId: details.columns[0].id };
    });

    const deleteAttempt = await page.evaluate(async ({ boardId, columnId }) => {
      const res = await fetch(`/api/boards/${boardId}/columns/${columnId}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return { status: res.status, body: await res.json() };
    }, { boardId: boardMeta.boardId, columnId: boardMeta.columnId });

    // Server rejects deletion because archived task is attached to this column
    expect(deleteAttempt.status).toBe(400);
    expect(deleteAttempt.body.error).toContain('Cannot delete column containing 1 archived task(s). Restore and move archived tasks to another column before deleting this column.');

    // Open Archived Tasks drawer and restore the task
    await page.click('[data-testid="btn-toggle-archived"]');
    await expect(page.locator('[data-testid="archived-tasks-drawer"]')).toBeVisible();
    await expect(page.locator('[data-testid="archived-task-title"]').first()).toHaveText('Task to Archive');
    await page.click('[data-testid="btn-restore-task"]');
    await page.click('[data-testid="btn-close-archived"]');

    // Task returns to 'To Do' column
    await expect(page.locator('[data-testid="task-card-title"]').first()).toHaveText('Task to Archive');

    await context.close();
  });
});
