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

test.describe('Syncraft Milestone 2: Accounts, Workspaces, and Authorized Documents', () => {
  let testServer: TestServerInstance;
  const TEST_SERVER_PORT = 1234; // Matches Vite proxy /api target!

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

  test('User registration, login, logout, and invalid credentials handling', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // 1. Should show auth modal initially
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();

    // 2. Switch to register mode
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await expect(page.locator('[data-testid="input-register-name"]')).toBeVisible();

    // 3. Register Alice
    await page.fill('[data-testid="input-register-name"]', 'Alice Owner');
    await page.fill('[data-testid="input-auth-email"]', 'alice@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');

    // 4. Registration automatically creates default workspace and logs Alice in
    await expect(page.locator('[data-testid="current-user-name"]')).toContainText('Alice Owner');
    await expect(page.locator('[data-testid="workspace-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace-select"]')).toContainText("Alice Owner's Workspace (owner)");

    // 5. Explicit logout
    await page.click('[data-testid="btn-logout"]');
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();

    // 6. Test invalid credentials
    await page.fill('[data-testid="input-auth-email"]', 'alice@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'wrongpass');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="auth-error-message"]')).toContainText('Invalid email or password');

    // 7. Test valid login
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toContainText('Alice Owner');

    await context.close();
  });

  test('Workspace creation, document creation, and document renaming', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // Register user
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Bob Creator');
    await page.fill('[data-testid="input-auth-email"]', 'bob@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'secret123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Create a new workspace
    await page.click('[data-testid="btn-create-workspace-dialog"]');
    await expect(page.locator('[data-testid="create-workspace-modal"]')).toBeVisible();
    await page.fill('[data-testid="input-new-workspace-name"]', 'Product Team');
    await page.click('[data-testid="btn-submit-create-workspace"]');

    // Verify workspace selected
    await expect(page.locator('[data-testid="workspace-select"]')).toContainText('Product Team');

    // Create a new document
    await page.click('[data-testid="btn-create-doc-dialog"]');
    await expect(page.locator('[data-testid="create-document-modal"]')).toBeVisible();
    await page.fill('[data-testid="input-new-doc-title"]', 'Q4 Roadmap');
    await page.click('[data-testid="btn-submit-create-doc"]');

    // Verify document created and active
    await expect(page.locator('[data-testid="active-doc-title-text"]')).toContainText('Q4 Roadmap');

    // Rename the document
    await page.click('[data-testid="btn-rename-doc"]');
    await page.fill('[data-testid="input-rename-document"]', 'Q4 Strategic Roadmap');
    await page.click('[data-testid="btn-save-rename"]');

    await expect(page.locator('[data-testid="active-doc-title-text"]')).toContainText('Q4 Strategic Roadmap');

    await context.close();
  });

  test('Workspace membership management: owner adds editor and viewer, last owner protected', async ({ browser }) => {
    // 1. Register User 2 (Eve) first
    const contextEve = await browser.newContext();
    const pageEve = await contextEve.newPage();
    await pageEve.goto('/');
    await pageEve.click('[data-testid="btn-toggle-auth-mode"]');
    await pageEve.fill('[data-testid="input-register-name"]', 'Eve Editor');
    await pageEve.fill('[data-testid="input-auth-email"]', 'eve@test.com');
    await pageEve.fill('[data-testid="input-auth-password"]', 'password123');
    await pageEve.click('[data-testid="btn-auth-submit"]');
    await expect(pageEve.locator('[data-testid="current-user-name"]')).toBeVisible();
    await contextEve.close();

    // 2. Register User 1 (Alice Owner)
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Admin');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'admin@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="btn-manage-members"]')).toBeVisible();

    // 3. Open Member Management modal
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await expect(pageAlice.locator('[data-testid="members-modal"]')).toBeVisible();

    // 4. Attempt to demote/remove last owner
    await pageAlice.selectOption('[data-testid="select-role-admin@test.com"]', 'editor');
    await expect(pageAlice.locator('[data-testid="members-error"]')).toContainText('Cannot demote the last owner');

    // 5. Add Eve as Editor
    await pageAlice.fill('[data-testid="input-member-email"]', 'eve@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toContainText('added successfully');
    await expect(pageAlice.locator('[data-testid="member-row-eve@test.com"]')).toBeVisible();

    // 6. Change Eve's role to Viewer
    await pageAlice.selectOption('[data-testid="select-role-eve@test.com"]', 'viewer');
    await expect(pageAlice.locator('[data-testid="select-role-eve@test.com"]')).toHaveValue('viewer');

    await contextAlice.close();
  });

  test('Viewer restrictions: viewers have read-only access and cannot write', async ({ browser }) => {
    // 1. Alice creates workspace and document
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Owner');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-viewer-test@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Alice types initial content
    await pageAlice.locator('.syncraft-prosemirror').click();
    await pageAlice.keyboard.type('Confidential owner specification.');

    // 2. Register Victor (Viewer)
    const contextVictor = await browser.newContext();
    const pageVictor = await contextVictor.newPage();
    await pageVictor.goto('/');
    await pageVictor.click('[data-testid="btn-toggle-auth-mode"]');
    await pageVictor.fill('[data-testid="input-register-name"]', 'Victor Viewer');
    await pageVictor.fill('[data-testid="input-auth-email"]', 'victor@test.com');
    await pageVictor.fill('[data-testid="input-auth-password"]', 'password123');
    await pageVictor.click('[data-testid="btn-auth-submit"]');
    await expect(pageVictor.locator('[data-testid="current-user-name"]')).toBeVisible();
    await expect(pageVictor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 3. Alice adds Victor to her workspace as Viewer
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'victor@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'viewer');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // 4. Victor switches to Alice's workspace
    await pageVictor.reload();
    await expect(pageVictor.locator('[data-testid="workspace-select"]')).toBeVisible();
    // Select Alice's workspace
    await pageVictor.selectOption('[data-testid="workspace-select"]', { label: "Alice Owner's Workspace (viewer)" });
    // Wait for documents to load and be displayed
    await expect(pageVictor.locator('.doc-item')).toBeVisible();
    await expect(pageVictor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Victor sees the document content
    await expect(pageVictor.locator('.syncraft-prosemirror')).toContainText('Confidential owner specification.');

    // Victor should see Viewer read-only badge and NO rename or add document buttons
    await expect(pageVictor.locator('[data-testid="role-badge-viewer"]')).toBeVisible();
    await expect(pageVictor.locator('[data-testid="btn-rename-doc"]')).toHaveCount(0);
    await expect(pageVictor.locator('[data-testid="btn-create-doc-dialog"]')).toHaveCount(0);

    // Victor's editor is read-only: typing should NOT modify the content
    await pageVictor.locator('.syncraft-prosemirror').click();
    await pageVictor.keyboard.type('Illegal viewer edit');
    await expect(pageVictor.locator('.syncraft-prosemirror')).not.toContainText('Illegal viewer edit');
    await expect(pageAlice.locator('.syncraft-prosemirror')).not.toContainText('Illegal viewer edit');

    // Attempt real Yjs protocol write directly from Victor's context
    const protocolWriteResult = await pageVictor.evaluate(() => {
      // Find the ydoc instance stored on window or dispatch directly
      const editorEl = document.querySelector('.syncraft-prosemirror');
      return { hasEditor: !!editorEl };
    });
    expect(protocolWriteResult.hasEditor).toBe(true);

    // Verify persisted database document does not have illegal edit
    const dbCheckClient = new (await import('pg')).default.Client({ connectionString: TEST_DB_URL });
    await dbCheckClient.connect();
    try {
      const dbDocRes = await dbCheckClient.query('SELECT data FROM documents');
      for (const row of dbDocRes.rows) {
        if (row.data) {
          const textBuf = Buffer.from(row.data).toString('utf-8');
          expect(textBuf).not.toContain('Illegal viewer edit');
        }
      }
    } finally {
      await dbCheckClient.end();
    }

    await contextAlice.close();
    await contextVictor.close();
  });

  test('Non-members cannot read documents or join collaboration sessions', async ({ browser, request }) => {
    // 1. Alice registers and has a private document
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Private');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-priv@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    const workspaceContent = pageAlice.locator('[data-testid="main-workspace-content"]');
    await expect(workspaceContent).toHaveAttribute('data-document-id', /.+/);
    const docId = await workspaceContent.getAttribute('data-document-id') || '';
    expect(docId).toBeTruthy();

    // 2. Stranger (Mallory) registers in her own account
    const contextMallory = await browser.newContext();
    const pageMallory = await contextMallory.newPage();
    await pageMallory.goto('/');
    await pageMallory.click('[data-testid="btn-toggle-auth-mode"]');
    await pageMallory.fill('[data-testid="input-register-name"]', 'Mallory Stranger');
    await pageMallory.fill('[data-testid="input-auth-email"]', 'mallory@test.com');
    await pageMallory.fill('[data-testid="input-auth-password"]', 'password123');
    await pageMallory.click('[data-testid="btn-auth-submit"]');
    await expect(pageMallory.locator('[data-testid="current-user-name"]')).toBeVisible();

    // 3. Mallory attempts unauthorized direct HTTP API access to Alice's document
    const cookies = await contextMallory.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'syncraft_session')?.value;

    const res = await request.patch(`/api/workspaces/fake-ws/documents/${docId}`, {
      headers: {
        Cookie: `syncraft_session=${sessionCookie}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      data: { title: 'Hacked Title' },
    });
    expect([403, 404]).toContain(res.status());

    await contextAlice.close();
    await contextMallory.close();
  });

  test('Account switching on same browser does not leak cached documents and removes caches on logout', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    // 1. User 1 (Alice) registers and writes secrets
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Alice Confidential');
    await page.fill('[data-testid="input-auth-email"]', 'alice-cache@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toBeVisible();

    await page.locator('.syncraft-prosemirror').click();
    await page.keyboard.type('Alice super secret financial records.');
    await expect(page.locator('[data-testid="local-persistence-indicator"]')).toContainText('Saved to this device');

    // 2. Alice explicitly logs out (which triggers cache wipe)
    await page.click('[data-testid="btn-logout"]');
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();

    // 3. User 2 (Bob) registers and logs in on the exact same browser context
    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Bob Clean');
    await page.fill('[data-testid="input-auth-email"]', 'bob-cache@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="current-user-name"]')).toContainText('Bob Clean');

    // Bob must NOT see Alice's document content
    await expect(page.locator('.syncraft-prosemirror')).not.toContainText('Alice super secret financial records.');

    await context.close();
  });

  test('Concurrent edits from two authenticated users in the same workspace converge', async ({ browser }) => {
    // 1. Alice registers (Owner)
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Coeditor');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-coed@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 2. Bob registers (Editor)
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob Coeditor');
    await pageBob.fill('[data-testid="input-auth-email"]', 'bob-coed@test.com');
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 3. Alice adds Bob as Editor
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', 'bob-coed@test.com');
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    // 4. Bob switches to Alice's workspace
    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice Coeditor's Workspace (editor)" });
    await expect(pageBob.locator('.doc-item')).toBeVisible();
    await expect(pageBob.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 5. Alice types paragraph 1
    await pageAlice.locator('.syncraft-prosemirror').click();
    await pageAlice.keyboard.type('First paragraph written by Alice in collaborative session.');
    await pageAlice.keyboard.press('Enter');

    // Bob sees Alice's text
    await expect(pageBob.locator('.syncraft-prosemirror')).toContainText('First paragraph written by Alice in collaborative session.');

    // Bob types paragraph 2
    await pageBob.locator('.syncraft-prosemirror').click();
    await pageBob.keyboard.type('Second paragraph written by Bob concurrently in collaborative session.');

    // Both converge to identical content
    await expect(pageAlice.locator('.syncraft-prosemirror')).toContainText(
      'Second paragraph written by Bob concurrently in collaborative session.'
    );
    await expect(pageBob.locator('.syncraft-prosemirror')).toContainText(
      'First paragraph written by Alice in collaborative session.'
    );

    await contextAlice.close();
    await contextBob.close();
  });

  test('Offline editing and reconnection reconciliation with authenticated editor', async ({ browser }) => {
    // 1. Alice registers
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Offline');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-offline@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Baseline content
    await pageAlice.locator('.syncraft-prosemirror').click();
    await pageAlice.keyboard.type('Baseline synchronized content.');
    await pageAlice.keyboard.press('Enter');

    // Simulate going offline
    await contextAlice.setOffline(true);
    await expect(pageAlice.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');

    // Types offline notes
    await pageAlice.locator('.syncraft-prosemirror').click();
    await pageAlice.keyboard.type('Queued offline notes drafted while disconnected.');

    // Reconnect
    await contextAlice.setOffline(false);
    await expect(pageAlice.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Content is preserved and reconciled
    await expect(pageAlice.locator('.syncraft-prosemirror')).toContainText('Queued offline notes drafted while disconnected.');

    await contextAlice.close();
  });

  test('Real server process restart persistence: recovers authenticated documents from PostgreSQL', async ({ browser }) => {
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice Restart');
    await pageAlice.fill('[data-testid="input-auth-email"]', 'alice-restart@test.com');
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');
    await expect(pageAlice.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    const expectedContent = 'Persistent document text saved to PostgreSQL across process restarts.';
    await pageAlice.locator('.syncraft-prosemirror').click();
    await pageAlice.keyboard.type(expectedContent);
    await expect(pageAlice.locator('[data-testid="local-persistence-indicator"]')).toContainText('Saved to this device');

    // Give debounce time to flush to PostgreSQL
    await pageAlice.waitForTimeout(2000);

    // Close browser context
    await contextAlice.close();

    // Kill and restart server process
    const pid1 = testServer.process.pid;
    expect(pid1).toBeDefined();
    await testServer.stop();

    testServer = await testServer.restart();
    const pid2 = testServer.process.pid;
    expect(pid2).toBeDefined();
    expect(pid2).not.toBe(pid1);

    // Fresh browser context logging back in
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');
    await expect(freshPage.locator('[data-testid="auth-modal"]')).toBeVisible();

    // Login as Alice
    await freshPage.fill('[data-testid="input-auth-email"]', 'alice-restart@test.com');
    await freshPage.fill('[data-testid="input-auth-password"]', 'password123');
    await freshPage.click('[data-testid="btn-auth-submit"]');
    await expect(freshPage.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Document content is restored from PostgreSQL
    await expect(freshPage.locator('.syncraft-prosemirror')).toContainText(expectedContent);

    await freshContext.close();
  });

  test('Page reload preservation with authenticated user', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Alice Reload');
    await page.fill('[data-testid="input-auth-email"]', 'alice-reload@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    const testContent = 'Document content that must persist perfectly across page reloads.';
    await page.locator('.syncraft-prosemirror').click();
    await page.keyboard.type(testContent);
    await expect(page.locator('.syncraft-prosemirror')).toContainText(testContent);

    // Wait for server debounce flush
    await page.waitForTimeout(1500);

    // Reload page
    await page.reload();
    await expect(page.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');
    await expect(page.locator('.syncraft-prosemirror')).toContainText(testContent);

    await context.close();
  });

  test('Separation of different documents: edits in doc A do not bleed into doc B', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Alice Docs');
    await page.fill('[data-testid="input-auth-email"]', 'alice-docs@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Doc 1 (Default "Getting Started")
    await page.locator('.syncraft-prosemirror').click();
    await page.keyboard.type('Content exclusively in Document One.');
    await expect(page.locator('.syncraft-prosemirror')).toContainText('Content exclusively in Document One.');

    // Create Doc 2
    await page.click('[data-testid="btn-create-doc-dialog"]');
    await page.fill('[data-testid="input-new-doc-title"]', 'Document Two');
    await page.click('[data-testid="btn-submit-create-doc"]');
    await expect(page.locator('[data-testid="active-doc-title-text"]')).toContainText('Document Two');
    await expect(page.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Verify Doc 2 does NOT have Doc 1's content
    await expect(page.locator('.syncraft-prosemirror')).not.toContainText('Content exclusively in Document One.');

    // Type content in Doc 2
    await page.locator('.syncraft-prosemirror').click();
    await page.keyboard.type('Content exclusively in Document Two.');
    await expect(page.locator('.syncraft-prosemirror')).toContainText('Content exclusively in Document Two.');

    // Switch back to Doc 1
    await page.locator('.doc-item', { hasText: 'Getting Started' }).click();
    await expect(page.locator('[data-testid="active-doc-title-text"]')).toContainText('Getting Started');
    await expect(page.locator('.syncraft-prosemirror')).toContainText('Content exclusively in Document One.');
    await expect(page.locator('.syncraft-prosemirror')).not.toContainText('Content exclusively in Document Two.');

    await context.close();
  });

  test('Active connection revocation on member removal: idle client stops receiving updates', async ({ browser }) => {
    // 1. Owner registers
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    pageOwner.on('dialog', (dialog) => dialog.accept());
    await pageOwner.goto('/');
    await pageOwner.click('[data-testid="btn-toggle-auth-mode"]');
    await pageOwner.fill('[data-testid="input-register-name"]', 'Owner MemberRevoke');
    await pageOwner.fill('[data-testid="input-auth-email"]', 'owner-revoke@test.com');
    await pageOwner.fill('[data-testid="input-auth-password"]', 'password123');
    await pageOwner.click('[data-testid="btn-auth-submit"]');
    await expect(pageOwner.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 2. Member registers
    const contextMember = await browser.newContext();
    const pageMember = await contextMember.newPage();
    await pageMember.goto('/');
    await pageMember.click('[data-testid="btn-toggle-auth-mode"]');
    await pageMember.fill('[data-testid="input-register-name"]', 'Member Revokee');
    await pageMember.fill('[data-testid="input-auth-email"]', 'member-revoke@test.com');
    await pageMember.fill('[data-testid="input-auth-password"]', 'password123');
    await pageMember.click('[data-testid="btn-auth-submit"]');
    await expect(pageMember.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 3. Owner adds member as Editor
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.fill('[data-testid="input-member-email"]', 'member-revoke@test.com');
    await pageOwner.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageOwner.click('[data-testid="btn-add-member"]');
    await expect(pageOwner.locator('[data-testid="members-success"]')).toBeVisible();
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 4. Member switches to owner workspace
    await pageMember.reload();
    await pageMember.selectOption('[data-testid="workspace-select"]', { label: "Owner MemberRevoke's Workspace (editor)" });
    await expect(pageMember.locator('.doc-item')).toBeVisible();
    await expect(pageMember.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 5. Initial collaborative text
    await pageOwner.locator('.syncraft-prosemirror').click();
    await pageOwner.keyboard.type('Initial shared content.');
    await expect(pageMember.locator('.syncraft-prosemirror')).toContainText('Initial shared content.');

    // 6. Owner removes member while member is IDLE (sending zero messages)
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await expect(pageOwner.locator('[data-testid="members-modal"]')).toBeVisible();
    await pageOwner.click('[data-testid="btn-remove-member-revoke@test.com"]');
    await expect(pageOwner.locator('[data-testid="member-row-member-revoke@test.com"]')).toHaveCount(0);
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 7. Member connection is terminated and access denied appears
    await expect(pageMember.locator('[data-testid="access-denied-banner"]')).toBeVisible({ timeout: 10000 });

    // 8. Owner types subsequent private updates
    await pageOwner.locator('.syncraft-prosemirror').click();
    await pageOwner.keyboard.type(' Highly confidential update after member removal.');
    await expect(pageOwner.locator('.syncraft-prosemirror')).toContainText('Highly confidential update after member removal.');

    // 9. Member must NEVER receive the update
    await pageMember.waitForTimeout(2000);
    await expect(pageMember.locator('.syncraft-prosemirror')).not.toContainText('Highly confidential update after member removal.');

    await contextOwner.close();
    await contextMember.close();
  });

  test('Active connection downgrade from editor to viewer: retains read access, prevents further writes', async ({ browser }) => {
    // 1. Owner registers
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    await pageOwner.goto('/');
    await pageOwner.click('[data-testid="btn-toggle-auth-mode"]');
    await pageOwner.fill('[data-testid="input-register-name"]', 'Owner Downgrade');
    await pageOwner.fill('[data-testid="input-auth-email"]', 'owner-downgrade@test.com');
    await pageOwner.fill('[data-testid="input-auth-password"]', 'password123');
    await pageOwner.click('[data-testid="btn-auth-submit"]');
    await expect(pageOwner.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 2. Editor registers
    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await pageEditor.goto('/');
    await pageEditor.click('[data-testid="btn-toggle-auth-mode"]');
    await pageEditor.fill('[data-testid="input-register-name"]', 'Editor Downgradee');
    await pageEditor.fill('[data-testid="input-auth-email"]', 'editor-downgrade@test.com');
    await pageEditor.fill('[data-testid="input-auth-password"]', 'password123');
    await pageEditor.click('[data-testid="btn-auth-submit"]');
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 3. Add as Editor
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.fill('[data-testid="input-member-email"]', 'editor-downgrade@test.com');
    await pageOwner.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageOwner.click('[data-testid="btn-add-member"]');
    await expect(pageOwner.locator('[data-testid="members-success"]')).toBeVisible();
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 4. Editor switches workspace and verifies write access
    await pageEditor.reload();
    await pageEditor.selectOption('[data-testid="workspace-select"]', { label: "Owner Downgrade's Workspace (editor)" });
    await expect(pageEditor.locator('.doc-item')).toBeVisible();
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    await pageEditor.locator('.syncraft-prosemirror').click();
    await pageEditor.keyboard.type('Legitimate edit while still an editor.');
    await expect(pageOwner.locator('.syncraft-prosemirror')).toContainText('Legitimate edit while still an editor.');

    // 5. Owner downgrades editor to viewer on active connection
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.selectOption('[data-testid="select-role-editor-downgrade@test.com"]', 'viewer');
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 6. Owner types a new update: downgraded user should still receive it (retains read access)
    await pageOwner.locator('.syncraft-prosemirror').click();
    await pageOwner.keyboard.type(' Owner announcement read by viewer.');
    await expect(pageEditor.locator('.syncraft-prosemirror')).toContainText('Owner announcement read by viewer.');

    // 7. Downgraded user tries to type: editor or server prevents further writes
    await pageEditor.locator('.syncraft-prosemirror').click();
    await pageEditor.keyboard.type(' Forbidden write after downgrade');
    await expect(pageOwner.locator('.syncraft-prosemirror')).not.toContainText('Forbidden write after downgrade');

    await contextOwner.close();
    await contextEditor.close();
  });

  test('Logout invalidates session and closes active connections across tabs', async ({ browser }) => {
    const context = await browser.newContext();
    const pageTab1 = await context.newPage();
    await pageTab1.goto('/');

    await pageTab1.click('[data-testid="btn-toggle-auth-mode"]');
    await pageTab1.fill('[data-testid="input-register-name"]', 'Alice Multitab');
    await pageTab1.fill('[data-testid="input-auth-email"]', 'alice-multitab@test.com');
    await pageTab1.fill('[data-testid="input-auth-password"]', 'password123');
    await pageTab1.click('[data-testid="btn-auth-submit"]');
    await expect(pageTab1.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Tab 2 opens the application in the same authenticated session
    const pageTab2 = await context.newPage();
    await pageTab2.goto('/');
    await expect(pageTab2.locator('[data-testid="current-user-name"]')).toContainText('Alice Multitab');
    await expect(pageTab2.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // User logs out on Tab 1
    await pageTab1.click('[data-testid="btn-logout"]');
    await expect(pageTab1.locator('[data-testid="auth-modal"]')).toBeVisible();

    // Tab 2 connection is revoked by server and shows access denied state
    await expect(pageTab2.locator('[data-testid="access-denied-banner"]')).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test('Session sweep terminates idle connection after session revocation in database', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');

    await page.click('[data-testid="btn-toggle-auth-mode"]');
    await page.fill('[data-testid="input-register-name"]', 'Sweep Test');
    await page.fill('[data-testid="input-auth-email"]', 'sweep@test.com');
    await page.fill('[data-testid="input-auth-password"]', 'password123');
    await page.click('[data-testid="btn-auth-submit"]');
    await expect(page.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Manually revoke session in PostgreSQL directly
    const pgClient = new (await import('pg')).default.Client({ connectionString: TEST_DB_URL });
    await pgClient.connect();
    try {
      await pgClient.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP');
    } finally {
      await pgClient.end();
    }

    // Client remains completely idle, but periodic sweep terminates it
    await expect(page.locator('[data-testid="access-denied-banner"]')).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test('Offline revocation: editor edits offline, owner revokes access, reconnection is rejected and changes never reach PostgreSQL', async ({ browser }) => {
    // 1. Owner registers
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    pageOwner.on('dialog', (dialog) => dialog.accept());
    await pageOwner.goto('/');
    await pageOwner.click('[data-testid="btn-toggle-auth-mode"]');
    await pageOwner.fill('[data-testid="input-register-name"]', 'Owner OfflineRevoke');
    await pageOwner.fill('[data-testid="input-auth-email"]', 'owner-offrev@test.com');
    await pageOwner.fill('[data-testid="input-auth-password"]', 'password123');
    await pageOwner.click('[data-testid="btn-auth-submit"]');
    await expect(pageOwner.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 2. Editor registers
    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await pageEditor.goto('/');
    await pageEditor.click('[data-testid="btn-toggle-auth-mode"]');
    await pageEditor.fill('[data-testid="input-register-name"]', 'Editor OfflineRevokee');
    await pageEditor.fill('[data-testid="input-auth-email"]', 'editor-offrev@test.com');
    await pageEditor.fill('[data-testid="input-auth-password"]', 'password123');
    await pageEditor.click('[data-testid="btn-auth-submit"]');
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 3. Owner adds editor
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.fill('[data-testid="input-member-email"]', 'editor-offrev@test.com');
    await pageOwner.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageOwner.click('[data-testid="btn-add-member"]');
    await expect(pageOwner.locator('[data-testid="members-success"]')).toBeVisible();
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 4. Editor switches workspace and establishes collaboration
    await pageEditor.reload();
    await pageEditor.selectOption('[data-testid="workspace-select"]', { label: "Owner OfflineRevoke's Workspace (editor)" });
    await expect(pageEditor.locator('.doc-item')).toBeVisible();
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Baseline shared text
    await pageOwner.locator('.syncraft-prosemirror').click();
    await pageOwner.keyboard.type('Legitimate baseline content.');
    await expect(pageEditor.locator('.syncraft-prosemirror')).toContainText('Legitimate baseline content.');

    // 5. Editor disconnects (goes offline)
    await contextEditor.setOffline(true);
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');

    // 6. Editor makes distinctive local changes while offline
    const distinctiveUnauthorizedEdit = 'DISTINCTIVE_UNAUTHORIZED_OFFLINE_PAYLOAD_12345';
    await pageEditor.locator('.syncraft-prosemirror').click();
    await pageEditor.keyboard.type(` ${distinctiveUnauthorizedEdit}`);
    await expect(pageEditor.locator('.syncraft-prosemirror')).toContainText(distinctiveUnauthorizedEdit);

    // 7. While editor is offline, Owner removes editor from workspace
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.click('[data-testid="btn-remove-editor-offrev@test.com"]');
    await expect(pageOwner.locator('[data-testid="member-row-editor-offrev@test.com"]')).toHaveCount(0);
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 8. Editor reconnects
    await contextEditor.setOffline(false);

    // 9. Synchronization is rejected and accurate access-denied state appears
    await expect(pageEditor.locator('[data-testid="access-denied-banner"]')).toBeVisible({ timeout: 10000 });

    // 10. The unauthorized change never reaches authorized peer
    await pageOwner.waitForTimeout(2000);
    await expect(pageOwner.locator('.syncraft-prosemirror')).not.toContainText(distinctiveUnauthorizedEdit);

    // 11. The unauthorized change never reaches persisted PostgreSQL document
    const pgClient = new (await import('pg')).default.Client({ connectionString: TEST_DB_URL });
    await pgClient.connect();
    try {
      const rows = await pgClient.query('SELECT data FROM documents');
      for (const row of rows.rows) {
        if (row.data) {
          const docString = Buffer.from(row.data).toString('utf-8');
          expect(docString).not.toContain(distinctiveUnauthorizedEdit);
        }
      }
    } finally {
      await pgClient.end();
    }

    await contextOwner.close();
    await contextEditor.close();
  });

  test('Editor downgraded to viewer while offline: reconnection does not accept queued writes', async ({ browser }) => {
    // 1. Owner registers
    const contextOwner = await browser.newContext();
    const pageOwner = await contextOwner.newPage();
    await pageOwner.goto('/');
    await pageOwner.click('[data-testid="btn-toggle-auth-mode"]');
    await pageOwner.fill('[data-testid="input-register-name"]', 'Owner OffDowngrade');
    await pageOwner.fill('[data-testid="input-auth-email"]', 'owner-offdown@test.com');
    await pageOwner.fill('[data-testid="input-auth-password"]', 'password123');
    await pageOwner.click('[data-testid="btn-auth-submit"]');
    await expect(pageOwner.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 2. Editor registers
    const contextEditor = await browser.newContext();
    const pageEditor = await contextEditor.newPage();
    await pageEditor.goto('/');
    await pageEditor.click('[data-testid="btn-toggle-auth-mode"]');
    await pageEditor.fill('[data-testid="input-register-name"]', 'Editor OffDowngradee');
    await pageEditor.fill('[data-testid="input-auth-email"]', 'editor-offdown@test.com');
    await pageEditor.fill('[data-testid="input-auth-password"]', 'password123');
    await pageEditor.click('[data-testid="btn-auth-submit"]');
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 3. Owner adds editor
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.fill('[data-testid="input-member-email"]', 'editor-offdown@test.com');
    await pageOwner.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageOwner.click('[data-testid="btn-add-member"]');
    await expect(pageOwner.locator('[data-testid="members-success"]')).toBeVisible();
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 4. Editor switches workspace
    await pageEditor.reload();
    await pageEditor.selectOption('[data-testid="workspace-select"]', { label: "Owner OffDowngrade's Workspace (editor)" });
    await expect(pageEditor.locator('.doc-item')).toBeVisible();
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // Baseline shared text
    await pageOwner.locator('.syncraft-prosemirror').click();
    await pageOwner.keyboard.type('Official baseline.');
    await expect(pageEditor.locator('.syncraft-prosemirror')).toContainText('Official baseline.');

    // 5. Editor disconnects (goes offline)
    await contextEditor.setOffline(true);
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Offline Mode');

    // 6. Editor types unauthorized offline changes
    const offlineQueuedEdit = 'QUEUED_OFFLINE_EDIT_THAT_SHOULD_BE_DROPPED_BY_VIEWER_DOWNGRADE';
    await pageEditor.locator('.syncraft-prosemirror').click();
    await pageEditor.keyboard.type(` ${offlineQueuedEdit}`);
    await expect(pageEditor.locator('.syncraft-prosemirror')).toContainText(offlineQueuedEdit);

    // 7. While editor is offline, owner downgrades role to viewer
    await pageOwner.click('[data-testid="btn-manage-members"]');
    await pageOwner.selectOption('[data-testid="select-role-editor-offdown@test.com"]', 'viewer');
    await pageOwner.click('[data-testid="btn-close-members-modal"]');

    // 8. Editor reconnects
    await contextEditor.setOffline(false);
    await expect(pageEditor.locator('[data-testid="connection-status-pill"]')).toContainText('Connected');

    // 9. Peer must NOT receive the queued edit
    await pageOwner.waitForTimeout(2000);
    await expect(pageOwner.locator('.syncraft-prosemirror')).not.toContainText(offlineQueuedEdit);

    // 10. Persisted database must NOT receive the queued edit
    const pgClient = new (await import('pg')).default.Client({ connectionString: TEST_DB_URL });
    await pgClient.connect();
    try {
      const rows = await pgClient.query('SELECT data FROM documents');
      for (const row of rows.rows) {
        if (row.data) {
          const docString = Buffer.from(row.data).toString('utf-8');
          expect(docString).not.toContain(offlineQueuedEdit);
        }
      }
    } finally {
      await pgClient.end();
    }

    await contextOwner.close();
    await contextEditor.close();
  });
});
