import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = process.env.UI_INSPECTION_OUTPUT_DIR || path.resolve(__dirname, '../test-results/ui-inspection');

test.describe('Visual Inspection Screenshots', () => {
  test('Capture key refined screens across desktop and mobile', async ({ browser }) => {
    // 1. Sign in / Auth Modal (Desktop & Mobile)
    const authContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const authPage = await authContext.newPage();
    await authPage.goto('/');
    await authPage.waitForTimeout(1000);
    // If logged in, logout to view auth card
    const logoutBtn = authPage.locator('[data-testid="btn-logout"]');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    }
    await expect(authPage.locator('[data-testid="btn-auth-submit"]')).toBeVisible();
    await authPage.screenshot({ path: path.join(ARTIFACTS_DIR, 'auth-modal-desktop.png') });

    // Mobile auth card
    await authPage.setViewportSize({ width: 390, height: 844 });
    await authPage.screenshot({ path: path.join(ARTIFACTS_DIR, 'auth-modal-mobile.png') });
    await authContext.close();

    // 2. Collaborative Document View with 2 Participants & Formatting Toolbar
    const docContextAlice = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageAlice = await docContextAlice.newPage();
    await pageAlice.goto('/');
    await pageAlice.click('[data-testid="btn-toggle-auth-mode"]');
    const timestamp = Date.now();
    await pageAlice.fill('[data-testid="input-register-name"]', 'Alice UI');
    await pageAlice.fill('[data-testid="input-auth-email"]', `alice-ui-${timestamp}@test.com`);
    await pageAlice.fill('[data-testid="input-auth-password"]', 'password123');
    await pageAlice.click('[data-testid="btn-auth-submit"]');

    const editorAlice = pageAlice.locator('[data-testid="editor-canvas"]');
    await expect(editorAlice).toBeVisible();
    await editorAlice.click();
    await pageAlice.keyboard.type('Welcome to the refreshed Syncraft collaborative workspace!\n\nThis document demonstrates rich text editing, responsive layout hierarchy, and collaborative awareness.');
    await expect(pageAlice.locator('[data-testid="server-sync-indicator"]')).toContainText('Synced');

    // Bob joins to demonstrate collaboration participants
    const docContextBob = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageBob = await docContextBob.newPage();
    await pageBob.goto('/');
    await pageBob.click('[data-testid="btn-toggle-auth-mode"]');
    await pageBob.fill('[data-testid="input-register-name"]', 'Bob UI');
    await pageBob.fill('[data-testid="input-auth-email"]', `bob-ui-${timestamp}@test.com`);
    await pageBob.fill('[data-testid="input-auth-password"]', 'password123');
    await pageBob.click('[data-testid="btn-auth-submit"]');
    await expect(pageBob.locator('[data-testid="current-user-name"]')).toBeVisible();

    // Alice invites Bob
    await pageAlice.click('[data-testid="btn-manage-members"]');
    await pageAlice.fill('[data-testid="input-member-email"]', `bob-ui-${timestamp}@test.com`);
    await pageAlice.selectOption('[data-testid="select-member-role"]', 'editor');
    await pageAlice.click('[data-testid="btn-add-member"]');
    await expect(pageAlice.locator('[data-testid="members-success"]')).toBeVisible();
    await pageAlice.click('[data-testid="btn-close-members-modal"]');

    await pageBob.reload();
    await pageBob.selectOption('[data-testid="workspace-select"]', { label: "Alice UI's Workspace (editor)" });
    await expect(pageBob.locator('[data-testid="editor-canvas"]')).toBeVisible();

    // Wait for awareness to show 2 users
    await pageAlice.waitForTimeout(1500);
    await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'editor-document-desktop.png') });

    // Mobile viewport document - test and screenshot mobile layout
    await pageAlice.setViewportSize({ width: 390, height: 844 });
    await pageAlice.waitForTimeout(500);
    await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'editor-document-mobile.png') });

    // Open mobile overflow menu to reach History and Participants
    await pageAlice.click('[data-testid="btn-mobile-overflow-toggle"]');
    await expect(pageAlice.locator('[data-testid="mobile-header-overflow-menu"]')).toBeVisible();
    await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'editor-mobile-overflow-menu.png') });

    // Open history via mobile menu
    await pageAlice.click('[data-testid="btn-mobile-open-history"]');
    await expect(pageAlice.locator('[data-testid="document-history-modal"]')).toBeVisible();
    await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'editor-history-mobile.png') });
    await pageAlice.keyboard.press('Escape'); // Verify Escape key closes history
    await expect(pageAlice.locator('[data-testid="document-history-modal"]')).not.toBeVisible();

    await pageAlice.setViewportSize({ width: 1280, height: 800 });

    // 3. Document History Drawer (List, Diff, Styled Controls)
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.waitForTimeout(500);
    await pageAlice.click('[data-testid="btn-save-version-open"]');
    await pageAlice.fill('[data-testid="input-save-version-label"]', 'v1.0 Polished UI Release');
    await pageAlice.click('[data-testid="btn-submit-save-version"]');
    await pageAlice.waitForTimeout(600);

    // Make an edit and save a second version to show diff
    await pageAlice.click('[data-testid="btn-history-done"]');
    await editorAlice.click();
    await pageAlice.keyboard.type('\nAdditional section for version comparison.');
    await pageAlice.waitForTimeout(1000);
    await pageAlice.click('[data-testid="btn-open-history-modal"]');
    await pageAlice.waitForTimeout(600);
    await pageAlice.click('[data-testid="tab-version-compare"]');
    await pageAlice.waitForTimeout(500);
    await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'editor-history-modal-desktop.png') });

    // Open restore confirmation dialog screenshot
    await pageAlice.click('[data-testid="btn-restore-version-open"]');
    await pageAlice.waitForTimeout(500);
    await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'history-restore-confirmation.png') });
    await pageAlice.keyboard.press('Escape'); // Test escape dismiss
    await pageAlice.waitForTimeout(300);
    await pageAlice.click('[data-testid="btn-history-done"]');

    // 4. Project Boards View
    const boardNavBtn = pageAlice.locator('[data-testid="nav-boards-tab"]');
    if (await boardNavBtn.isVisible()) {
      await boardNavBtn.click();
      await pageAlice.waitForTimeout(500);

      // Create a sample board if none exists
      const createFirstBtn = pageAlice.locator('[data-testid="btn-create-first-board"]');
      if (await createFirstBtn.isVisible()) {
        await createFirstBtn.click();
        await pageAlice.fill('[data-testid="input-new-board-title"]', 'Sprint Roadmap & Milestones');
        await pageAlice.click('[data-testid="btn-submit-create-board"]');
        await pageAlice.waitForTimeout(600);

        // Add a sample task
        await pageAlice.click('[data-testid="btn-add-task-col-0"]');
        await pageAlice.fill('[data-testid="input-quick-task-title"]', 'Refine Document History & Typography');
        await pageAlice.click('[data-testid="btn-submit-quick-task"]');
        await pageAlice.waitForTimeout(600);
      }

      await pageAlice.screenshot({ path: path.join(ARTIFACTS_DIR, 'project-board-desktop.png') });
    }

    await docContextAlice.close();
    await docContextBob.close();
  });
});
