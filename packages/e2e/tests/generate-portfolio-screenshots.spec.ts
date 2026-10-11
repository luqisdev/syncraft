import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
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

const DOCS_SCREENSHOTS_DIR = path.resolve(__dirname, '../../../../docs/screenshots');

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

test.describe('Portfolio Curated Screenshots Generation', () => {
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
  test('Generate realistic collaborative document, boards, and history screenshots', async ({ browser }) => {
    const timestamp = Date.now();

    // 1. Setup Alice (Lead Engineer)
    const contextAlice = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');

    const logoutBtnAlice = pageAlice.locator('[data-testid="btn-logout"]');
    if (await logoutBtnAlice.isVisible()) {
      await logoutBtnAlice.click();
    }

    // Register Alice
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Elena Rostova');
    await pageAlice.fill('[data-testid="input-auth-email"]', `elena.rostova.${timestamp}@example.com`);
    await pageAlice.fill('[data-testid="input-auth-password"]', 'syncraftDemo2026!');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Rename default document to a realistic project brief
    await pageAlice.click('[data-testid="btn-rename-doc"]');
    await pageAlice.fill('[data-testid="input-rename-document"]', 'Q4 Distributed Sync Engine Brief');
    await pageAlice.click('[data-testid="btn-save-rename"]');
    await expect(pageAlice.locator('[data-testid="active-doc-title-text"]')).toHaveText('Q4 Distributed Sync Engine Brief');

    // Write initial brief content
    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type(
      '# Project Overview: Distributed Sync Architecture\n\n' +
      'Syncraft delivers conflict-free real-time document collaboration and synchronized kanban boards. ' +
      'The architecture pairs Yjs CRDTs over WebSocket transports with transactional PostgreSQL durability.\n\n' +
      '## Core Objectives\n' +
      '- Active session revocation on workspace membership downgrades\n' +
      '- Authoritative server revision cursor tracking to detect restorations reliably\n' +
      '- Local offline draft capture with clean reconciliation during reconnection\n'
    );
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Create Version 1 Checkpoint
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'v1.0 Technical Specification');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.waitForTimeout(600);
    await pageAlice.click('[data-testid="btn-history-done"]');

    // 2. Setup Bob (System Architect)
    const contextBob = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');

    const logoutBtnBob = pageBob.locator('[data-testid="btn-logout"]');
    if (await logoutBtnBob.isVisible()) {
      await logoutBtnBob.click();
    }

    // Register Bob
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Marcus Vance');
    await pageBob.fill('[data-testid="input-auth-email"]', `marcus.vance.${timestamp}@example.com`);
    await pageBob.fill('[data-testid="input-auth-password"]', 'syncraftDemo2026!');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Elena invites Marcus as editor
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', `marcus.vance.${timestamp}@example.com`);
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // Marcus selects Elena's workspace
    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Elena Rostova's Workspace (editor)" });
    await expect(pageBob.locator('[data-testid="editor-canvas"]')).toBeVisible();

    // Marcus contributes to the document
    const editorBob = pageBob.locator('[data-testid="editor-canvas"]');
    await editorBob.click();
    await pageBob.keyboard.type('\n### Architectural Guarantees\n- Optimistic locking on task boards with 409 conflict detection.\n- Multi-tab coordination backed by IndexedDB persistence.\n');
    await pageBob.waitForTimeout(1000);

    // Save Version 2 Checkpoint by Marcus
    await pageBob.click('[data-testid="btn-open-history-modal"]');
    await pageBob.click('[data-testid="btn-save-version-open"]');
    await pageBob.fill('[data-testid="input-save-version-label"]', 'v1.1 Architectural Guarantees Added');
    await pageBob.click('[data-testid="btn-submit-save-version"]');
    await pageBob.waitForTimeout(600);
    await pageBob.click('[data-testid="btn-history-done"]');

    // Wait for awareness and sync
    await pageAlice.waitForTimeout(1500);

    // SCREENSHOT 1: Collaborative Document View (Desktop)
    await pageAlice.screenshot({ path: path.join(DOCS_SCREENSHOTS_DIR, 'collaborative-editor.png') });

    // SCREENSHOT 2: Mobile Document View (390px)
    await pageAlice.setViewportSize({ width: 390, height: 844 });
    await pageAlice.waitForTimeout(500);
    await pageAlice.screenshot({ path: path.join(DOCS_SCREENSHOTS_DIR, 'mobile-editor.png') });

    // SCREENSHOT 3: Mobile History Drawer (390px)
    await pageAlice.click('[data-testid="btn-mobile-overflow-toggle"]');
    await pageAlice.click('[data-testid="btn-mobile-open-history"]');
    await pageAlice.waitForTimeout(600);
    await pageAlice.screenshot({ path: path.join(DOCS_SCREENSHOTS_DIR, 'mobile-history.png') });
    await pageAlice.keyboard.press('Escape');

    // Restore desktop viewport
    await pageAlice.setViewportSize({ width: 1280, height: 800 });
    await pageAlice.waitForTimeout(500);

    // SCREENSHOT 4: Document History & Diff Comparison (Desktop)
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.waitForTimeout(500);
    // Select v1.0 to show diff comparison against live document
    const v1Item = pageAlice.locator('[data-testid^="checkpoint-item-"]', { hasText: 'v1.0 Technical Specification' });
    await v1Item.click();
    await pageAlice.waitForTimeout(500);
    await pageAlice.click('[data-testid="tab-version-compare"]');
    await pageAlice.waitForTimeout(500);
    await pageAlice.screenshot({ path: path.join(DOCS_SCREENSHOTS_DIR, 'document-history.png') });
    await pageAlice.click('[data-testid="btn-history-done"]');

    // 3. Setup Project Board with representative tasks in all 3 columns
    await pageAlice.click('[data-testid="nav-boards-tab"]');
    await pageAlice.waitForTimeout(500);

    const createFirstBtn = pageAlice.locator('[data-testid="btn-create-first-board"]');
    if (await createFirstBtn.isVisible()) {
      await createFirstBtn.click();
      await pageAlice.fill('[data-testid="input-new-board-title"]', 'Sprint Roadmap & Milestones');
      await pageAlice.click('[data-testid="btn-submit-create-board"]');
      await pageAlice.waitForTimeout(600);
    }

    // Add tasks to "To Do" (Column 0)
    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Benchmark CRDT garbage collection');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');
    await pageAlice.waitForTimeout(400);

    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Audit WebSocket disconnect recovery backoff');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');
    await pageAlice.waitForTimeout(400);

    // Add task and move to "In Progress" (Column 1)
    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Implement authoritative restoration cursor');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');
    await pageAlice.waitForTimeout(400);

    // Move task to In Progress using column selector
    const colSelects = pageAlice.locator('select').filter({ hasText: 'To Do' });
    if (await colSelects.count() > 0) {
      await colSelects.first().selectOption({ label: '→ In Progress' });
      await pageAlice.waitForTimeout(400);
    }

    // Add task and move to "Done" (Column 2)
    await pageAlice.click('[data-testid="btn-add-task-col-0"]');
    await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Refine history modal and typography tokens');
    await pageAlice.click('[data-testid="btn-submit-quick-task"]');
    await pageAlice.waitForTimeout(400);

    const colSelectsDone = pageAlice.locator('select').filter({ hasText: 'To Do' });
    if (await colSelectsDone.count() > 0) {
      await colSelectsDone.first().selectOption({ label: '→ Done' });
      await pageAlice.waitForTimeout(400);
    }

    await pageAlice.waitForTimeout(1000);

    // SCREENSHOT 5: Project Boards View (Desktop)
    await pageAlice.screenshot({ path: path.join(DOCS_SCREENSHOTS_DIR, 'project-boards.png') });

    await contextAlice.close();
    await contextBob.close();
  });
});
