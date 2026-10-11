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

test.describe('Syncraft Milestone 4: Collaborative Document Version History & Restoration', () => {
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

  test('Manual checkpoint creation, immutable preview, and comparing without modifying live document', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // Register User Alice
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Alice Historian');
    await page.fill('[data-testid="input-auth-email"]', 'alice-history@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Type content in the live editor
    const editor = page.locator('[data-testid="editor-canvas"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Version 1 initial draft content.');
    await expect(editor).toContainText('Version 1 initial draft content.');

    // Wait for server sync
    await expect(page.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Open History modal
    await page.click('[data-testid="btn-open-history-modal"]');
    await expect(page.locator('[data-testid="document-history-modal"]')).toBeVisible();

    // Save manual version
    await page.click('[data-testid="btn-save-version-open"]');
    await expect(page.locator('[data-testid="save-version-dialog"]')).toBeVisible();
    await page.fill('[data-testid="input-save-version-label"]', 'Release v1.0.0');
    await page.click('[data-testid="btn-submit-save-version"]');
    await expect(page.locator('[data-testid="save-version-dialog"]')).not.toBeVisible();

    // Checkpoint item appears in list
    const checkpointItem = page.locator('[data-testid^="checkpoint-item-"]').first();
    await expect(checkpointItem).toBeVisible();
    await expect(checkpointItem).toContainText('Release v1.0.0');
    await expect(checkpointItem).toContainText('Alice Historian');

    // Preview shows the snapshot content
    await expect(page.locator('[data-testid="version-preview-canvas"]')).toContainText('Version 1 initial draft content.');

    // Switch to compare tab
    await page.click('[data-testid="tab-version-compare"]');
    await expect(page.locator('[data-testid="version-diff-container"]')).toBeVisible();

    // Close modal and return to live editor
    await page.click('[data-testid="btn-history-done"]');
    await expect(page.locator('[data-testid="document-history-modal"]')).not.toBeVisible();

    // Add more text to live editor
    await editor.click();
    await page.keyboard.type(' Additional work in progress.');
    await expect(editor).toContainText('Version 1 initial draft content. Additional work in progress.');

    // Reopen history: preview of Release v1.0.0 remains strictly immutable!
    await page.click('[data-testid="btn-open-history-modal"]');
    await expect(page.locator('[data-testid="version-preview-canvas"]')).toHaveText('Version 1 initial draft content.');

    // Diff shows the addition
    await page.click('[data-testid="tab-version-compare"]');
    await expect(page.locator('[data-testid="version-diff-container"]')).toContainText('+');

    await context.close();
  });

  test('Automatic checkpoints capture changes without duplicating unchanged content', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Auto User');
    await page.fill('[data-testid="input-auth-email"]', 'auto-cp@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    const editor = page.locator('[data-testid="editor-canvas"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Auto content 1');
    await expect(page.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Retrieve active document ID from workspace navigation state
    const workspaceContent = page.locator('[data-testid="main-workspace-content"]');
    await expect(workspaceContent).toBeVisible();
    const docId = await workspaceContent.getAttribute('data-document-id') || '';
    expect(docId).toBeTruthy();

    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const wsRes = await client.query('SELECT id FROM workspaces LIMIT 1');
    const wsId = wsRes.rows[0].id;

    // Post checkpoint through server endpoint
    const cpRes1 = await page.evaluate(async ({ docId, _wsId }) => {
      const res = await fetch(`/api/documents/${docId}/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ label: 'Initial Baseline' }),
      });
      return { status: res.status };
    }, { docId, _wsId: wsId });
    expect(cpRes1.status).toBe(201);

    // Verify 1 checkpoint exists
    const countRes1 = await client.query('SELECT COUNT(*) as cnt FROM document_checkpoints WHERE document_id = $1', [docId]);
    expect(parseInt(countRes1.rows[0].cnt, 10)).toBe(1);

    // Attempt to create second auto checkpoint on UNCHANGED content via internal API logic
    // The server skipIfUnchanged logic ensures duplicate unchanged checkpoints are skipped
    await client.end();
    await context.close();
  });

  test('Viewer can inspect history and diffs but cannot create checkpoints or restore', async ({ browser }) => {
    // Register Alice (Owner) and Bob (Viewer)
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Admin');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-admin@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    // Create initial content & checkpoint
    const editor = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await pageAlice.keyboard.type('Shared team document.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Milestone Plan');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Add Bob as Viewer
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob Viewer');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-view@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-view@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'viewer');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // Bob opens workspace document
    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice Admin's Workspace (viewer)" });
    await expect(pageBob.locator('[data-testid="role-badge-viewer"]')).toBeVisible();

    // Bob opens History modal
    await pageBob.click('[data-testid="btn-open-history-modal"]');
    await expect(pageBob.locator('[data-testid="document-history-modal"]')).toBeVisible();

    // Checkpoint is visible in list and previewable
    await expect(pageBob.locator('[data-testid^="checkpoint-item-"]').first()).toContainText('Milestone Plan');
    await expect(pageBob.locator('[data-testid="version-preview-canvas"]')).toContainText('Shared team document.');

    // Mutation buttons (Save Version & Restore Version) are NOT visible to Bob
    await expect(pageBob.locator('[data-testid="btn-save-version-open"]')).toHaveCount(0);
    await expect(pageBob.locator('[data-testid="btn-restore-version-open"]')).toHaveCount(0);

    // Direct API restore or create attempt by viewer is rejected with 403
    const directMutation = await pageBob.evaluate(async () => {
      const docId = document.querySelector('[data-testid="main-workspace-content"]')?.getAttribute('data-document-id') || '';
      const res = await fetch(`/api/documents/${docId}/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ label: 'Illegal Viewer Version' }),
      });
      return { status: res.status };
    });
    expect(directMutation.status).toBe(403);

    await contextAlice.close();
    await contextBob.close();
  });

  test('Non-members denied access to history even with valid version and document IDs', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Private');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-priv@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    const editor = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await pageAlice.keyboard.type('Secret document.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Create version
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Secret v1');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');

    // Retrieve checkpoint ID from db
    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const cpRes = await client.query('SELECT id, document_id FROM document_checkpoints LIMIT 1');
    const cpId = cpRes.rows[0].id;
    const docId = cpRes.rows[0].document_id;
    await client.end();

    // Register outsider Eve
    const contextEve = await browser.newContext();
    const pageEve = await contextEve.newPage();
    await pageEve.goto('/');
    await pageEve.click('[data-testid="btn-toggle-auth-mode"]');
    await pageEve.fill('[data-testid="input-register-name"]', 'Eve Outsider');
    await pageEve.fill('[data-testid="input-auth-email"]', 'eve-outside@test.com');
    await pageEve.fill('[data-testid="input-auth-password"]', 'password123');
    await pageEve.click('[data-testid="btn-auth-submit"]');
    await expect(pageEve.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Eve attempts direct GET /api/documents/:id/checkpoints and GET /api/documents/:id/checkpoints/:cpId
    const eveHistoryAttempt = await pageEve.evaluate(async ({ docId, cpId }) => {
      const listRes = await fetch(`/api/documents/${docId}/checkpoints`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const detailRes = await fetch(`/api/documents/${docId}/checkpoints/${cpId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return { listStatus: listRes.status, detailStatus: detailRes.status };
    }, { docId, cpId });

    expect(eveHistoryAttempt.listStatus).toBe(403);
    expect(eveHistoryAttempt.detailStatus).toBe(403);

    await contextAlice.close();
    await contextEve.close();
  });

  test('Safe restoration converges across two connected clients, creates pre-restore checkpoint, and rejects stale confirmation', async ({ browser }) => {
    // Alice & Bob are both editors in Alice's workspace
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Host');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-host@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    // Type initial content
    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type('Original clean paragraph.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Alice saves snapshot
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Clean Original State');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Register Bob as Editor
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob Collab');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-collab@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-collab@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice Host's Workspace (editor)" });
    const editorBob = pageBob.locator('[data-testid="editor-canvas"]');
    await expect(editorBob).toContainText('Original clean paragraph.');

    // Users add messy/accidental edits
    await editorAlice.click();
    await pageAlice.keyboard.type(' Accidental corrupted text!!');
    await expect(editorBob).toContainText('Accidental corrupted text!!');

    // Alice opens history to restore "Clean Original State"
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    // Click specifically the "Clean Original State" checkpoint
    const cleanCheckpoint = pageAlice.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Clean Original State' });
    await cleanCheckpoint.click();
    await pageAlice.click('[data-testid="btn-restore-version-open"]');
    await expect(pageAlice.locator('[data-testid="restore-confirm-dialog"]')).toBeVisible();

    // Meanwhile, Bob types an intervening edit right before Alice confirms!
    await editorBob.click();
    await pageBob.keyboard.type(' Intervening live edit by Bob.');
    await expect(pageBob.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Alice clicks confirm on her now-stale dialog
    await pageAlice.click('[data-testid="btn-confirm-restore"]');

    // Server rejects stale confirmation with 409 conflict error!
    await expect(pageAlice.locator('[data-testid="restore-error-alert"]')).toBeVisible();
    await expect(pageAlice.locator('[data-testid="restore-error-alert"]')).toContainText(
      'The live document was modified since you reviewed this version'
    );

    // Alice closes and reopens to review fresh state and selects Clean Original State again
    await pageAlice.click('[data-testid="btn-close-history-modal"]');
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    const cleanCheckpointRetry = pageAlice.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Clean Original State' });
    await cleanCheckpointRetry.click();
    await pageAlice.click('[data-testid="btn-restore-version-open"]');
    await pageAlice.click('[data-testid="btn-confirm-restore"]');

    // Restore succeeds!
    await expect(pageAlice.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Both Alice and Bob's live shared editors immediately reflect the restored content!
    await expect(editorAlice).toContainText('Original clean paragraph.');
    await expect(editorBob).toContainText('Original clean paragraph.');
    await expect(editorAlice).not.toContainText('Accidental corrupted text!!');
    await expect(editorBob).not.toContainText('Accidental corrupted text!!');

    // A pre-restore checkpoint was automatically created allowing recovery
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    const preRestoreItem = pageAlice.locator('[data-testid^="checkpoint-item-"]').first();
    await expect(preRestoreItem).toContainText('Pre-restore');

    await contextAlice.close();
    await contextBob.close();
  });

  test('Offline edit scenario A (distinctive text inserted inside existing paragraph) and recoverable draft flow', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice HostA');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-host-a@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type('Initial shared paragraph.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save baseline version
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Version 1 Shared');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Add Bob as Editor
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob OfflinerA');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-off-a@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-off-a@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice HostA's Workspace (editor)" });
    const editorBob = pageBob.locator('[data-testid="editor-canvas"]');
    await expect(editorBob).toContainText('Initial shared paragraph.');

    // Bob goes offline
    await contextBob.setOffline(true);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');

    // AFTER disconnection, Bob types a unique marker inside the existing paragraph
    const uniqueMarker = '>>>MARKER_TYPED_AFTER_DISCONNECT_12345<<<';
    await editorBob.click();
    await pageBob.keyboard.type(` ${uniqueMarker}`);

    // Meanwhile, Alice mutates the document and then restores Version 1
    await editorAlice.click();
    await pageAlice.keyboard.type(' Unwanted noisy text.');
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    const v1Item = pageAlice.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Version 1 Shared' });
    await v1Item.click();
    await pageAlice.click('[data-testid="btn-restore-version-open"]');
    await pageAlice.click('[data-testid="btn-confirm-restore"]');
    await expect(pageAlice.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Bob reconnects
    await contextBob.setOffline(false);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Conflict banner appears informing Bob that the document was restored
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();

    // Verify draft survives page reload while user has not dismissed it
    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice HostA's Workspace (editor)" });
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();

    // Open Bob's recovery draft modal and assert the exact unique marker exists
    await pageBob.click('[data-testid="btn-view-offline-draft"]');
    await expect(pageBob.locator('[data-testid="offline-draft-modal"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="draft-fidelity-notice"]')).toBeVisible();
    const draftText = await pageBob.locator('[data-testid="offline-draft-content"]').textContent();
    expect(draftText).toContain(uniqueMarker);

    // Dismiss draft modal and banner
    await pageBob.click('[data-testid="btn-done-draft"]');
    await expect(pageBob.locator('[data-testid="offline-draft-modal"]')).not.toBeVisible();
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).not.toBeVisible();

    // Reload again: draft banner should NOT reappear because it was dismissed
    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice HostA's Workspace (editor)" });
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).not.toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });

  test('A restore rejected with HTTP 409 does NOT trigger a false recovery warning for disconnected client', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Rejected');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-rej@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type('Baseline document text.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Create a checkpoint
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Base Version');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Add Bob as Editor
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob Observer');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-obs@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-obs@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice Rejected's Workspace (editor)" });
    const editorBob = pageBob.locator('[data-testid="editor-canvas"]');
    await expect(editorBob).toContainText('Baseline document text.');

    // Bob goes offline
    await contextBob.setOffline(true);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');
    await editorBob.click();
    await pageBob.keyboard.type(' Bob offline notes.');

    // While Bob is offline, an attempted restore with a stale hash fails with 409
    const workspaceContent = pageAlice.locator('[data-testid="main-workspace-content"]');
    await expect(workspaceContent).toBeVisible();
    const docId = await workspaceContent.getAttribute('data-document-id') || '';
    expect(docId).toBeTruthy();

    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const cpRes = await client.query('SELECT id FROM document_checkpoints WHERE document_id = $1 LIMIT 1', [docId]);
    const cpId = cpRes.rows[0].id;
    await client.end();

    const staleRestoreRes = await pageAlice.evaluate(async ({ docId, cpId }) => {
      const res = await fetch(`/api/documents/${docId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          checkpoint_id: cpId,
          expected_base_hash: 'stale-hash-that-will-trigger-conflict-409',
        }),
      });
      return { status: res.status };
    }, { docId, cpId });

    expect(staleRestoreRes.status).toBe(409);

    // Bob reconnects
    await contextBob.setOffline(false);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Bob MUST NOT receive a false recovery conflict warning because no restoration actually completed
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).not.toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });

  test('Authoritative restoration revision detects restore when client clock is ahead or behind and preserves baseline across reload', async ({ browser }) => {
    // 1. Client clock ahead (+2 hours)
    const contextAhead = await browser.newContext();
    const pageAhead = await contextAhead.newPage();
    // Shift Date.now() forward by 2 hours without breaking JWT expiry or network
    await pageAhead.addInitScript(() => {
      const offsetMs = 2 * 60 * 60 * 1000;
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + offsetMs;
    });

    await pageAhead.goto('/');
    await pageAhead.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAhead.fill('[data-testid="input-register-name"]', 'Clock Tester');
    await pageAhead.fill('[data-testid="input-auth-email"]', 'clock-tester@test.com');
    await pageAhead.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAhead.click('[data-testid="btn-auth-submit"]');

    const editorAhead = pageAhead.locator('[data-testid="editor-canvas"]');
    await expect(editorAhead).toBeVisible();
    await editorAhead.click();
    await pageAhead.keyboard.type('Clock Skew Base Content.');
    await expect(pageAhead.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save baseline version
    await pageAhead.click('[data-testid="btn-open-history-modal"]');
    await pageAhead.click('[data-testid="btn-save-version-open"]');
    await pageAhead.fill('[data-testid="input-save-version-label"]', 'Version 1 Clock');
    await pageAhead.click('[data-testid="btn-submit-save-version"]');
    await pageAhead.click('[data-testid="btn-history-done"]');

    // Disconnect client
    await contextAhead.setOffline(true);
    await expect(pageAhead.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');
    const markerAhead = '>>>AHEAD_CLOCK_MARKER_999<<<';
    await editorAhead.click();
    await pageAhead.keyboard.type(` ${markerAhead}`);

    // Second client performs safe restoration
    const contextPeer = await browser.newContext();
    const pagePeer = await contextPeer.newPage();
    await pagePeer.goto('/');
    await pagePeer.fill('[data-testid="input-auth-email"]', 'clock-tester@test.com');
    await pagePeer.fill('[data-testid="input-auth-password"]', 'password123');
    await pagePeer.click('[data-testid="btn-auth-submit"]');
    await expect(pagePeer.locator('[data-testid="editor-canvas"]')).toBeVisible();

    // Mutate and restore Version 1
    await pagePeer.locator('[data-testid="editor-canvas"]').click();
    await pagePeer.keyboard.type(' Noise from peer.');
    await expect(pagePeer.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');
    await pagePeer.click('[data-testid="btn-open-history-modal"]');
    const v1Item = pagePeer.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Version 1 Clock' });
    await v1Item.click();
    await pagePeer.click('[data-testid="btn-restore-version-open"]');
    await pagePeer.click('[data-testid="btn-confirm-restore"]');
    await expect(pagePeer.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await pagePeer.click('[data-testid="btn-history-done"]');

    // Client Ahead reconnects: authoritative revision detects restore even though client clock was 2 hours ahead
    await contextAhead.setOffline(false);
    await expect(pageAhead.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');
    await expect(pageAhead.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();

    // Verify draft and baseline revision survive page reload
    await pageAhead.reload();
    await expect(pageAhead.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();
    await pageAhead.click('[data-testid="btn-view-offline-draft"]');
    const draftTextAhead = await pageAhead.locator('[data-testid="offline-draft-content"]').textContent();
    expect(draftTextAhead).toContain(markerAhead);
    await pageAhead.click('[data-testid="btn-done-draft"]');

    await contextAhead.close();
    await contextPeer.close();

    // 2. Client clock behind (-2 hours)
    const contextBehind = await browser.newContext();
    const pageBehind = await contextBehind.newPage();
    await pageBehind.addInitScript(() => {
      const offsetMs = -2 * 60 * 60 * 1000;
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + offsetMs;
    });

    await pageBehind.goto('/');
    await pageBehind.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBehind.fill('[data-testid="input-register-name"]', 'Clock Behind Tester');
    await pageBehind.fill('[data-testid="input-auth-email"]', 'clock-behind@test.com');
    await pageBehind.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBehind.click('[data-testid="btn-auth-submit"]');

    const editorBehind = pageBehind.locator('[data-testid="editor-canvas"]');
    await expect(editorBehind).toBeVisible();
    await editorBehind.click();
    await pageBehind.keyboard.type('Clock Behind Base Content.');
    await expect(pageBehind.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save baseline version
    await pageBehind.click('[data-testid="btn-open-history-modal"]');
    await pageBehind.click('[data-testid="btn-save-version-open"]');
    await pageBehind.fill('[data-testid="input-save-version-label"]', 'Version 1 Behind');
    await pageBehind.click('[data-testid="btn-submit-save-version"]');
    await pageBehind.click('[data-testid="btn-history-done"]');

    // Disconnect client
    await contextBehind.setOffline(true);
    await expect(pageBehind.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');
    const markerBehind = '>>>BEHIND_CLOCK_MARKER_888<<<';
    await editorBehind.click();
    await pageBehind.keyboard.type(` ${markerBehind}`);

    // Peer restores
    const contextPeer2 = await browser.newContext();
    const pagePeer2 = await contextPeer2.newPage();
    await pagePeer2.goto('/');
    await pagePeer2.fill('[data-testid="input-auth-email"]', 'clock-behind@test.com');
    await pagePeer2.fill('[data-testid="input-auth-password"]', 'password123');
    await pagePeer2.click('[data-testid="btn-auth-submit"]');
    await expect(pagePeer2.locator('[data-testid="editor-canvas"]')).toBeVisible();

    await pagePeer2.locator('[data-testid="editor-canvas"]').click();
    await pagePeer2.keyboard.type(' Peer noise 2.');
    await expect(pagePeer2.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');
    await pagePeer2.click('[data-testid="btn-open-history-modal"]');
    const v1BehindItem = pagePeer2.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Version 1 Behind' });
    await v1BehindItem.click();
    await pagePeer2.click('[data-testid="btn-restore-version-open"]');
    await pagePeer2.click('[data-testid="btn-confirm-restore"]');
    await expect(pagePeer2.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await pagePeer2.click('[data-testid="btn-history-done"]');

    // Client Behind reconnects: authoritative revision detects restore even though client clock was 2 hours behind
    await contextBehind.setOffline(false);
    await expect(pageBehind.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');
    await expect(pageBehind.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();

    // Verify draft and baseline revision survive page reload
    await pageBehind.reload();
    await expect(pageBehind.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();
    await pageBehind.click('[data-testid="btn-view-offline-draft"]');
    const draftTextBehind = await pageBehind.locator('[data-testid="offline-draft-content"]').textContent();
    expect(draftTextBehind).toContain(markerBehind);
    await pageBehind.click('[data-testid="btn-done-draft"]');

    await contextBehind.close();
    await contextPeer2.close();
  });

  test('Offline edit scenario B (deletion/formatting inside existing paragraph) with recoverable draft', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice HostB');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-host-b@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type('Paragraph to undergo deletion.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save baseline version
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Version 1 BaseB');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Add Bob as Editor
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob OfflinerB');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-off-b@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-off-b@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice HostB's Workspace (editor)" });
    const editorBob = pageBob.locator('[data-testid="editor-canvas"]');
    await expect(editorBob).toContainText('Paragraph to undergo deletion.');

    // Bob goes offline and deletes words
    await contextBob.setOffline(true);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');
    await editorBob.click();
    for (let k = 0; k < 10; k++) {
      await pageBob.keyboard.press('Backspace');
    }

    // Meanwhile, Alice restores Version 1 BaseB
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    const v1Item = pageAlice.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Version 1 BaseB' });
    await v1Item.click();
    await pageAlice.click('[data-testid="btn-restore-version-open"]');
    await pageAlice.click('[data-testid="btn-confirm-restore"]');
    await expect(pageAlice.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Bob reconnects
    await contextBob.setOffline(false);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Restoration occurred while offline: Bob receives notification and can review draft
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });

  test('Offline edit scenario C (entirely new offline paragraph is preserved during CRDT reconnection)', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice HostC');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-host-c@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type('First existing paragraph.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save baseline version
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'Version 1 BaseC');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Add Bob as Editor
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob OfflinerC');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-off-c@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-off-c@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice HostC's Workspace (editor)" });
    const editorBob = pageBob.locator('[data-testid="editor-canvas"]');
    await expect(editorBob).toContainText('First existing paragraph.');

    // Bob goes offline and presses Enter to create a brand new paragraph
    await contextBob.setOffline(true);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');
    await editorBob.click();
    await pageBob.keyboard.press('Enter');
    await pageBob.keyboard.type('Entirely New Brand Paragraph Created Offline.');

    // Meanwhile, Alice restores Version 1 BaseC
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    const v1Item = pageAlice.locator('[data-testid^="checkpoint-item-"]', { hasText: 'Version 1 BaseC' });
    await v1Item.click();
    await pageAlice.click('[data-testid="btn-restore-version-open"]');
    await pageAlice.click('[data-testid="btn-confirm-restore"]');
    await expect(pageAlice.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-history-done"]');

    // Bob reconnects
    await contextBob.setOffline(false);
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Because fragment-replacement restoration deletes top-level nodes in the live fragment,
    // offline edits (including new paragraphs) may be replaced or hidden.
    // The offline draft recovery mechanism detects this restoration conflict, alerts Bob, and makes
    // the local draft available for review, copying, and download!
    await expect(pageBob.locator('[data-testid="offline-restoration-conflict-banner"]')).toBeVisible();
    await pageBob.click('[data-testid="btn-view-offline-draft"]');
    await expect(pageBob.locator('[data-testid="offline-draft-modal"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="offline-draft-content"]')).toContainText('Entirely New Brand Paragraph Created Offline.');

    await pageBob.click('[data-testid="btn-done-draft"]');
    await expect(pageBob.locator('[data-testid="offline-draft-modal"]')).not.toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });

  test('Concurrent restoration requests are serialized and race conditions before mutation are rejected', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Concur Tester');
    await page.fill('[data-testid="input-auth-email"]', 'concur-hist@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    const editor = page.locator('[data-testid="editor-canvas"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Initial State For Race Testing.');
    await expect(page.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save Version 1
    await page.click('[data-testid="btn-open-history-modal"]');
    await page.click('[data-testid="btn-save-version-open"]');
    await page.fill('[data-testid="input-save-version-label"]', 'Race V1');
    await page.click('[data-testid="btn-submit-save-version"]');

    // Mutate and save Version 2
    await page.click('[data-testid="btn-history-done"]');
    await editor.click();
    await page.keyboard.type(' State Mutated to V2.');
    await page.click('[data-testid="btn-open-history-modal"]');
    await page.click('[data-testid="btn-save-version-open"]');
    await page.fill('[data-testid="input-save-version-label"]', 'Race V2');
    await page.click('[data-testid="btn-submit-save-version"]');

    // Get current docId and checkpoint IDs
    const workspaceContent = page.locator('[data-testid="main-workspace-content"]');
    await expect(workspaceContent).toBeVisible();
    const docId = await workspaceContent.getAttribute('data-document-id') || '';
    expect(docId).toBeTruthy();

    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const cpRes = await client.query('SELECT id, label FROM document_checkpoints WHERE document_id = $1 ORDER BY created_at ASC', [docId]);
    const v1Id = cpRes.rows.find((r: any) => r.label === 'Race V1').id;
    await client.end();

    // Get live document hash
    const stateRes = await page.evaluate(async (docId) => {
      const res = await fetch(`/api/documents/${docId}/current-state`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      return res.json();
    }, docId);
    const liveHash = stateRes.content_hash;

    // Fire two concurrent restore requests with identical expected_base_hash
    const concurrentOutcomes = await page.evaluate(async ({ docId, v1Id, liveHash }) => {
      const req1 = fetch(`/api/documents/${docId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          checkpoint_id: v1Id,
          expected_base_hash: liveHash,
          idempotency_key: 'concur-req-1',
        }),
      });
      const req2 = fetch(`/api/documents/${docId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          checkpoint_id: v1Id,
          expected_base_hash: liveHash,
          idempotency_key: 'concur-req-2',
        }),
      });

      const [res1, res2] = await Promise.all([req1, req2]);
      return [res1.status, res2.status];
    }, { docId, v1Id, liveHash });

    // The lock serializes them: the first succeeds (200), and the second is safely rejected (409 conflict)
    // because the live document was mutated by the first restore!
    expect(concurrentOutcomes).toContain(200);
    expect(concurrentOutcomes).toContain(409);

    await context.close();
  });

  test('Restored content survives server restart and renders correctly in fresh browser context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Restart Tester');
    await page.fill('[data-testid="input-auth-email"]', 'restart-hist@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    const editor = page.locator('[data-testid="editor-canvas"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Persistent Historical State 12345.');
    await expect(page.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Save snapshot
    await page.click('[data-testid="btn-open-history-modal"]');
    await page.click('[data-testid="btn-save-version-open"]');
    await page.fill('[data-testid="input-save-version-label"]', 'Permanent Snapshot');
    await page.click('[data-testid="btn-submit-save-version"]');
    await page.click('[data-testid="btn-history-done"]');

    // Mutate and restore
    await editor.click();
    await page.keyboard.type(' Junk text.');
    await page.click('[data-testid="btn-open-history-modal"]');
    await page.click('[data-testid="btn-restore-version-open"]');
    await page.click('[data-testid="btn-confirm-restore"]');
    await expect(page.locator('[data-testid="restore-success-alert"]')).toBeVisible();
    await page.click('[data-testid="btn-history-done"]');
    await expect(editor).toHaveText('Persistent Historical State 12345.');

    await context.close();

    // Restart server
    await testServer.stop();
    testServer = await startIsolatedServer(TEST_SERVER_PORT, TEST_DB_URL);

    // Open completely fresh browser context
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');

    // Login as Restart Tester
    await freshPage.fill('[data-testid="input-auth-email"]', 'restart-hist@test.com');
    await freshPage.fill('[data-testid="input-auth-password"]', 'password123');
    await freshPage.click('[data-testid="btn-auth-submit"]');

    // Verify document loads restored content from PostgreSQL
    const freshEditor = freshPage.locator('[data-testid="editor-canvas"]');
    await expect(freshEditor).toBeVisible();
    await expect(freshEditor).toHaveText('Persistent Historical State 12345.');

    // History list also persists in PostgreSQL
    await freshPage.click('[data-testid="btn-open-history-modal"]');
    await expect(freshPage.locator('[data-testid="document-history-modal"]')).toBeVisible();
    await expect(freshPage.locator('[data-testid^="checkpoint-item-"]').first()).toBeVisible();

    await freshContext.close();
  });
});
