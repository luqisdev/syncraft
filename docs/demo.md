# Syncraft Demonstration Guide

This guide walks through a realistic 3–5 minute demonstration of Syncraft's core capabilities: real-time collaborative editing with multi-user awareness, server-enforced role authorization, persistent Kanban boards, version checkpoints with immutable diff comparison, and recoverable offline editing.

---

## Prerequisites & Setup (1 minute)

1. Ensure the PostgreSQL database and backend server are running:
   ```bash
   # Terminal 1: Server
   pnpm run dev:server
   ```
2. Start the web frontend:
   ```bash
   # Terminal 2: Web Client
   pnpm run dev:web
   ```
3. Open two browser windows side-by-side:
   - **Window A** (User 1): Standard browser window (`http://localhost:5173`)
   - **Window B** (User 2): Private/Incognito browser window (`http://localhost:5173`)

---

## 1. Multi-User Collaboration & Real-Time Awareness (1 minute)

1. **User Registration**:
   - In **Window A**, create an account:
     - Name: `Elena Rostova`
     - Email: `elena@example.com`
     - Password: `password123`
   - In **Window B**, create a second account:
     - Name: `Marcus Vance`
     - Email: `marcus@example.com`
     - Password: `password123`
2. **Workspace Invitation**:
   - In **Window A**, click the **Members** button in the top left sidebar.
   - Enter `marcus@example.com`, select role **Editor**, and click **Add Member**.
   - In **Window B**, reload or select `Elena Rostova's Workspace (editor)` from the workspace dropdown.
3. **Live Collaborative Editing**:
   - Both users are now viewing the default document.
   - Type in **Window A**: Notice remote cursor flags with Elena's name and color appear in **Window B** in real time.
   - Type in **Window B**: Characters merge seamlessly via Yjs CRDT conflict-free resolution without locking or cursor jumping.
   - Look at the top right header in **Window A**: Elena sees participant chips showing both active collaborators (`ER` and `MV`).

---

## 2. Server-Enforced Role Restrictions & Member Revocation (45 seconds)

1. **Viewer Downgrade (Preserving Read Access)**:
   - In **Window A**, click **Members**, find `marcus@example.com`, and change his role to **Viewer**.
2. **Immediate Enforcement**:
   - Look at **Window B** without refreshing:
     - Marcus remains connected with authorized read-only access.
     - His role indicator immediately switches to a yellow `Viewer (Read-only)` badge.
     - The ProseMirror editor canvas disables input.
     - Document formatting buttons and document rename controls are hidden or disabled.
     - Attempting to send mutations directly to the server is rejected with `HTTP 403 Forbidden` (protocol-level Yjs writes are also rejected).
3. **Contrast with Member Removal**:
   - If a member is deleted entirely from the workspace, the server executes `terminateConnectionsForUserInWorkspace`, severing active WebSockets and SSE streams with code 4403 (`Access revoked to this workspace`) and cutting off all read and write capabilities. In contrast, downgrading to Viewer preserves active reading while dynamically neutralizing write capabilities on the wire.

---

## 3. Real-Time Kanban Task Synchronization (45 seconds)

1. **Switch Views**:
   - In **Window A**, promote Marcus back to **Editor**.
   - In both windows, click the **Boards** tab in the sidebar.
2. **Board & Task Actions**:
   - In **Window A**, create a board: `Sprint Roadmap`.
   - In **Window B**, the new board appears dynamically. Select it.
   - Add a task in the **To Do** column in **Window A**: `Audit WebSocket disconnect recovery backoff`.
   - In **Window B**, the card appears in real time over Server-Sent Events (SSE).
3. **Task State & Ordering**:
   - In **Window B**, use the column selector on the task to move it to `→ In Progress`.
   - The card transitions to "In Progress" in **Window A** immediately.
   - Reordering and movements are transactionally protected in PostgreSQL using dense integer positions (`0, 1, 2...`).

---

## 4. Version Checkpoints, Text Diff & Restoration (1 minute)

1. **Save Checkpoint**:
   - Return to the **Documents** tab in **Window A**.
   - Click the **History** button in the header.
   - Click **Save Version**, type `v1.0 Technical Specification`, and submit.
   - The version appears in the scrollable checkpoints list with creator attribution (`Elena Rostova`) and timestamp.
2. **Make an Edit & Compare**:
   - Close the History drawer (`Escape` or click "Return to Live Editor").
   - Add a new section to the live document: `### Concurrency Strategy\nOptimistic locking with version counters.`.
   - Reopen **History** and select `v1.0 Technical Specification`.
   - Click **Compare with Current**:
     - The text diff renders additions with green `+` badges, highlighting precisely what changed since the checkpoint.
     - Click **Read-Only Preview**: Review the isolated historic snapshot. Notice it does not mutate or affect the live document.
3. **Safe Restoration**:
   - Click **Restore This Version**.
   - An accessible confirmation modal appears, explaining that a pre-restore checkpoint will be taken automatically.
   - Click **Confirm & Restore**.
   - Both **Window A** and **Window B** immediately update to the restored version state via broadcast CRDT transactions.

---

## 5. Offline Draft Capture & Recovery Flow (45 seconds)

1. **Simulate Disconnection**:
   - In **Window B** (Marcus), open Developer Tools (`F12`), go to the **Network** tab, and toggle throttling to **Offline**.
   - The status pill immediately turns red: `Offline Mode`.
   - The persistence tag confirms: `Saved to this device`.
2. **Offline Typing**:
   - In **Window B**, type unique notes: `Marcus offline notes written while disconnected.`.
3. **Intervening Server Restoration**:
   - In **Window A** (Elena, online), open **History** and restore a different historical checkpoint.
   - Live document state on the server advances to a new authoritative restoration revision.
4. **Reconnection & Recovery**:
   - In **Window B**, switch Network throttling back to **Online**.
   - The client reconnects and compares the server revision with Marcus's stored baseline revision cursor.
   - Detecting the server-side restoration, Syncraft displays an **Offline Restoration Conflict Banner**.
   - Marcus can click **Review Offline Draft** to view his typed text, copy it to clipboard, or download it as a `.txt` file, ensuring no offline thinking is silently lost.
