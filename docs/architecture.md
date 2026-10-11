# Syncraft Architecture & Data Flow

Syncraft is a real-time collaborative document platform engineered for correctness, high concurrency, offline editing resilience, and server-enforced role-based access control with PostgreSQL persistence.

```mermaid
flowchart TD
    subgraph Browser Client (React / Vite)
        AuthUI["Auth Modal & Workspaces"]
        Tiptap["Tiptap Editor (ProseMirror)"]
        YDoc["Yjs Document (CRDT)"]
        IDB[("Namespaced IndexedDB\nsyncraft-doc-{userId}-{docId}")]
        HPProvider["@hocuspocus/provider\n(HttpOnly Cookie / Session Token)"]

        Tiptap <--> YDoc
        YDoc <--> IDB
        YDoc <--> HPProvider
    end

    subgraph Collaboration & Auth Server (Node.js)
        HTTPServer["HTTP REST API\n(/api/auth, /api/workspaces, /api/members)"]
        RateLimiter["Sliding-Window IP Rate Limiter"]
        HPServer["@hocuspocus/server (WebSocket)"]
        AuthHook["onAuthenticate Hook\n(Session validation & Workspace role check)"]
        MessageHook["beforeHandleMessage Hook\n(Mid-session role & session re-verification)"]
        Room["Yjs Room in Memory"]

        HTTPServer --> RateLimiter
        HPServer --> AuthHook
        AuthHook --> MessageHook
        MessageHook --> Room
    end

    subgraph PostgreSQL Database (SCRAM-SHA-256)
        Users[("users")]
        Sessions[("sessions")]
        Workspaces[("workspaces")]
        Members[("workspace_members")]
        WorkspaceDocs[("workspace_documents")]
        Docs[("documents (BYTEA CRDT state)")]
        Boards[("project_boards")]
        BoardCols[("board_columns")]
        Tasks[("tasks")]
        IdempKeys[("idempotency_keys")]
        
        HTTPServer <--> Users
        HTTPServer <--> Sessions
        HTTPServer <--> Workspaces
        HTTPServer <--> Members
        HTTPServer <--> WorkspaceDocs
        HTTPServer <--> Boards
        HTTPServer <--> BoardCols
        HTTPServer <--> Tasks
        HTTPServer <--> IdempKeys
        HPServer <--> Docs
        AuthHook <--> Sessions
        AuthHook <--> Members
    end

    HPProvider <== "WebSocket (Authenticated, readOnly for Viewers)" ==> HPServer
    AuthUI <== "HTTP (Credentials: include, CSRF Header)" ==> HTTPServer
    AuthUI <== "Server-Sent Events (/api/boards/:id/events)" ==> HTTPServer
```

---

## Architectural Decisions & Security Implementation

### 1. Authentication & Session Management
- **Password Security**: Passwords hashed with `bcryptjs` (salt rounds: 10). Passwords are never logged or stored in plain text.
- **Session Tokens**: Generated with cryptographically strong pseudo-random bytes (`crypto.randomBytes(32).toString('hex')`).
- **Cookie Security**: Session tokens are transmitted via `HttpOnly`, `SameSite=Lax` cookies (with `Secure` enabled in production). No session credentials are stored in `localStorage` or URL query parameters.
- **CSRF Protection**: State-changing endpoints require the `X-Requested-With: XMLHttpRequest` custom header or `application/json` content type.
- **Rate Limiting**: Sliding-window in-memory IP rate limiter restricts authentication attempts (15 attempts/minute) to mitigate brute-force attacks.

### 2. Workspace Access Control, Real-Time Revocation & Document Authorization
- **Server Identity Derivation**: Document IDs alone are never treated as authorization. The user's identity and workspace permissions are derived exclusively from their verified session token.
- **Active Connection Revocation on Single-Server Architecture**:
  - `terminateConnectionsForSession(sessionId)`: Triggered on user logout. Iterates in-memory `server.documents`, locating all active connections across tabs bound to that session ID, closing them with code 4403 (`Session revoked`) and severing the underlying WebSockets.
  - `terminateConnectionsForUserInWorkspace(workspaceId, userId)`: Triggered on member removal via `DELETE /api/workspaces/:id/members/:userId`. Iterates `server.documents`, immediately closing all active connections belonging to that user in the specified workspace with code 4403 (`Access revoked to this workspace`). Because the connection is severed and removed from `document.connections`, the user immediately ceases receiving real-time broadcasts even if they send no further messages.
  - `updateConnectionRoleForUserInWorkspace(workspaceId, userId, newRole)`: Triggered on member role changes via `PATCH /api/workspaces/:id/members/:userId`. Dynamically updates `conn.context.role` and mutates `conn.readOnly = (newRole === 'viewer')` in real time, cutting off write capabilities on existing connections while preserving permitted read access.
  - **Periodic Session & Role Sweep**: To enforce expiration on idle connections that send no messages and guard against direct database manipulations, a background timer runs every 5 seconds on the server. It sweeps all in-memory connections across `server.documents`, querying PostgreSQL (`validateSession` and `getDocumentAccess`). Any connections with expired/revoked sessions or removed workspace memberships are terminated immediately.
  - **Multi-Instance Cluster Limitation**: The current in-memory connection manager operates within a single Node.js process. In a distributed multi-instance deployment (e.g., across horizontal Kubernetes pods), terminating connections or updating roles across nodes will require an external pub/sub event bus (such as Redis Pub/Sub or PostgreSQL `LISTEN/NOTIFY`) to broadcast revocation signals across all server replicas.
- **Protocol-Level Write Rejection**:
  - `onAuthenticate`: Validates the session and verifies workspace membership for the requested document. Rejects unauthorized connections immediately.
  - For `viewer` roles, sets `connection.readOnly = true` directly on the server WebSocket connection, preventing sync step 2 or update propagation.
  - `beforeHandleMessage`: Revalidates session revocation and workspace membership on incoming messages. If a viewer attempts to send Yjs update messages, the server explicitly raises an access denied error.
- **Last-Owner Guard**: Workspace members cannot demote or remove the last owner of a workspace.

### 3. Namespaced Offline Persistence & Offline Revocation
- **User-Namespaced Storage**: IndexedDB persistence is strictly partitioned by user ID: `syncraft-doc-${userId}-${docId}`.
- **Explicit Logout Cleanup**: On logout, sensitive memory state is cleared, all user sessions are revoked on the server, the session cookie is expired, and all IndexedDB databases matching `syncraft-doc-${userId}-*` are purged to prevent subsequent accounts on the shared machine from reading cached documents.
- **Offline Revocation & Legitimate Reconciliation**:
  - Legitimate offline edits by authorized editors are automatically reconciled and persisted upon reconnection.
  - If an editor makes local modifications while offline and their workspace access is removed prior to reconnection, `onAuthenticate` rejects the reconnection handshake (code 4403). The client transitions to an explicit `Access Denied` state and disables the editor.
  - Because the WebSocket connection is rejected at handshake, the local offline Yjs updates are never transmitted or merged, never reaching peer clients, and never persisted to the server's PostgreSQL store.
  - If an editor is downgraded to a viewer while offline, reconnection accepts the connection strictly with `readOnly = true`. Queued local offline writes are ignored by the server and blocked from propagating to peers or the database.

### 4. Project Boards & Real-Time Task Synchronization
- **PostgreSQL Authoritative Model**:
  - Project boards, columns, and tasks are modeled relationally in PostgreSQL (`project_boards`, `board_columns`, `tasks`).
  - Default columns created atomically upon board creation: "To Do", "In Progress", "Done".
  - Non-empty columns cannot be deleted: attempts to delete columns containing active tasks return HTTP 400 with actionable messages.
  - Deletion of boards and tasks is omitted in favor of explicit archiving (`is_archived = true`) and restoring.
- **Task Ordering Strategy**:
  - Tasks within each column are assigned dense, contiguous 0-indexed integer `position` values (`0, 1, 2, ...`).
  - Moves within the same column or across columns execute inside an atomic database transaction (`withTransaction`) acquiring row locks (`SELECT ... FOR UPDATE OF t`).
  - When a task is moved, surrounding positions in the source and destination columns are shifted atomically with contiguous updates (`position = position - 1` or `position = position + 1`), preventing position gaps, duplicate positions, lost tasks, or corrupted ordering.
- **Optimistic Concurrency Control (OCC)**:
  - Each task maintains an integer `version` incremented on every content edit (`version = version + 1`).
  - Task edit requests must provide the client's known `version`. If the client version does not match the database version, the update is rejected with `HTTP 409 Conflict`.
  - The client handles HTTP 409 by displaying an explicit conflict banner, discarding uncommitted edits, and refreshing the authoritative task state from the server.
  - When two users edit the same task concurrently, the first committed write succeeds and advances `version`. The second write is safely rejected with HTTP 409 rather than silently overwriting changes.
  - When two users move the same task concurrently, database row-level locking serializes the moves: both moves execute sequentially against authoritative positions, ensuring the task ends up in a valid, deterministic column and position without duplication.
- **Idempotent Task Creation**:
  - Clients generate a client UUID (`idempotency_key`) sent in task creation requests (`POST /api/boards/:id/tasks`).
  - The server stores keys in `idempotency_keys` with foreign keys and unique constraints.
  - Retried requests encountering an existing idempotency key return the previously created task with `HTTP 200 OK` without creating duplicate cards.
- **Real-Time Broadcasts via Server-Sent Events (SSE)**:
  - Authorized board viewers subscribe to `GET /api/boards/:id/events` receiving SSE streams.
  - Events (`task:created`, `task:updated`, `task:moved`, `task:archived`, `task:restored`, `column:created`, `column:renamed`, `column:reordered`, `column:deleted`, `board:renamed`) are broadcast strictly AFTER successful database transaction commits.
  - Each event includes monotonically increasing sequence numbers (`seq`) allowing clients to detect missed updates and trigger full reloads.
  - Active session revocation, member removal, and viewer downgrades are immediately enforced on SSE streams.
- **Connectivity Behavior**:
  - Unlike document editing (which supports offline local CRDT edits), board mutations strictly require an active server connection.
  - When disconnected, the UI displays an offline warning banner and disables board mutation controls (creating tasks, moving columns/tasks, archiving).
  - Upon reconnection, the client automatically re-fetches the authoritative board state from PostgreSQL.

### 5. Document Version History, Preview, and Safe Restoration Under Collaboration
- **Snapshot Representation & Yjs/Tiptap Architecture**:
  - In Yjs (`^13.6.27`) and Tiptap (`^2.11.5`), collaborative documents maintain state as an append-only set of item operations across logical clients.
  - Checkpoints snapshot the complete document state using standard Yjs binary serialization: `Y.encodeStateAsUpdate(doc)`. This captures the exact state vector and history in a self-contained, canonical binary representation stored in PostgreSQL `document_checkpoints.snapshot_data` (`BYTEA`).
  - Previews isolate the historical snapshot by initializing a standalone `new Y.Doc()` in memory on the client and applying the checkpoint's binary update. The preview Tiptap editor is set to `editable: false` and is completely disconnected from network providers (`@hocuspocus/provider` or WebSocket connections), ensuring that inspecting history never leaks or broadcasts edits to collaborators.
- **Safe Restoration Mechanism**:
  - Restoring by blindly reapplying old binary updates does not reverse newer content because CRDTs resolve conflicts by keeping both branches or favoring higher Lamport clocks. Replacing the PostgreSQL database blob directly is also catastrophic because active in-memory documents in `@hocuspocus/server` would remain out of sync with database state.
  - Safe restoration in Syncraft restores a historical version **as a new live change to the existing authoritative shared document**:
    1. The snapshot binary update is applied to a temporary `Y.Doc` to read its target XML fragment (`doc.getXmlFragment('default')`).
    2. In a single atomic transaction on the live authoritative `Y.Doc` (`liveDoc.transact(...)`), the existing children of `liveDoc.getXmlFragment('default')` are cleared and replaced with cloned elements from the snapshot fragment.
    3. This generates a standard CRDT delta update representing the replacement, which `@hocuspocus/server` immediately syncs across open WebSocket connections to all connected browser clients.
    4. The restored state is immediately flushed to PostgreSQL in the `documents` table.
- **Optimistic Concurrency Control (OCC) & Stale Confirmation Guard**:
  - Every live document's content is fingerprinted using a SHA-256 hash computed over its plain text and structure (`content_hash`).
  - When a user opens the restore confirmation dialog, the client holds the `content_hash` observed during review (`expected_base_hash`).
  - If another collaborator types an edit before the restore commits, the live document's hash changes. The server rejects the stale confirmation with `HTTP 409 Conflict`.
  - The client displays an actionable error banner informing the user that intervening edits occurred and prompts them to review the fresh document state.
- **Pre-Restore Checkpoint Recovery**:
  - Before applying any restoration mutation, the server automatically captures a `pre_restore` checkpoint of the live document. If an accidental or erroneous restoration occurs, collaborators can immediately review and restore the pre-restore checkpoint, safely recovering the prior state.
- **Restore Idempotency**:
  - Restore requests include a client-generated UUID `idempotency_key`. The server tracks committed keys in `restore_idempotency_keys` with foreign keys and unique constraints. If a client retries due to a network timeout, the server returns the previous restore outcome (`HTTP 200 OK`) without repeating the transaction.
- **Offline Editing Reconnection Contract & Authoritative Restoration Cursor**:
  - When an editor works offline, changes are persisted locally in `y-indexeddb` and the client's latest uncommitted plain text is captured to a user- and document-scoped offline draft (`syncraft-offline-draft-${userId}-${docId}`).
  - Detection of concurrent restorations while disconnected uses an authoritative, per-document server revision cursor (`revision` in `document_restorations`), completely decoupled from wall-clock timestamps (`Date.now()` or client/server clock alignment).
  - Every successfully completed restoration atomically advances the document's revision cursor via `COALESCE(MAX(revision), 0) + 1`. Rejected restoration attempts (e.g., HTTP 409 stale expected base hash or validation failures) do not advance the revision cursor.
  - While connected, the client records its last acknowledged revision (`syncraft-offline-draft-rev-${userId}-${docId}`).
  - When the client disconnects and edits offline, the offline draft preserves the uncommitted edits alongside the acknowledged baseline revision.
  - On reconnection, the client queries `/api/documents/:id/restorations` with retry backoff and compares `serverRevision` against its stored baseline:
    - If `serverRevision > acknowledgedRevision`, a completed restoration occurred while offline. The client preserves the offline draft, presents a non-intrusive recovery conflict banner, and allows the user to review, copy, or export their offline text.
    - If `serverRevision <= acknowledgedRevision`, no restoration occurred; offline edits reconcile cleanly via normal Yjs CRDT synchronization.
    - If a legacy offline draft exists without a stored baseline revision, the client preserves the draft and honestly explains the uncertainty in the banner and modal without falsely asserting that a restore occurred.
  - Dismissing the banner explicitly clears the draft and baseline, preventing banner reappearance across page reloads.

- **Honest Multi-User Attribution & Automatic Checkpoints**:
  - Scheduled automatic checkpoints capture open active documents at a configurable interval (default: 5 minutes) via a server-side timer.
  - Change Detection: Computes SHA-256 hash against the latest checkpoint; unchanged documents are skipped without creating duplicate rows.
  - Multi-user documents are never attributed solely to the last editor. Automatic checkpoints record `created_by = NULL` and are clearly labeled as "Automatic Checkpoint".
- **Text Diff Comparison**:
  - Version comparison performs a line-level Longest Common Subsequence (LCS) diff comparing the checkpoint against the live document's current text. Added lines (`+`) and removed lines (`-`) are displayed in a syntax-highlighted comparison view. Formatting marks are rendered in the preview editor, with explicit copy clarifying that the diff highlights structural text changes.
- **Storage Growth Limitations**:
  - Checkpoints are persisted in PostgreSQL. History listing endpoints (`GET /api/documents/:id/checkpoints`) are paginated via `limit` and `offset` parameters. Automated pruning and TTL deletions are omitted in this milestone.

### 6. Database Migrations
Versioned schema migrations run sequentially on server startup:
- `v1`: `documents` (`id TEXT PRIMARY KEY`, `data BYTEA`, `created_at`, `updated_at`).
- `v2`: `users`, `sessions`, `workspaces`, `workspace_members`, `workspace_documents`.
- `v3`: `project_boards`, `board_columns`, `tasks`, `idempotency_keys`.
- `v4`: `document_checkpoints`, `restore_idempotency_keys`.
- `v5`: `document_restorations` (`id UUID PRIMARY KEY`, `document_id TEXT`, `checkpoint_id UUID`, `revision INT NOT NULL DEFAULT 1`, `restored_by UUID`, `restored_at TIMESTAMPTZ`, index on `(document_id, revision)`).
