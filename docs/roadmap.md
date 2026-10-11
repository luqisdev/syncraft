# Syncraft Product Roadmap

## Milestone 1: Core Foundation & Collaborative Document Editor (Completed)

- [x] **Monorepo Setup**: pnpm workspaces with TypeScript, root linting, formatting, and strict type-checks.
- [x] **Client App (`apps/web`)**: Vite + React + TypeScript with dark mode workspace layout.
- [x] **Rich Text & CRDT Integration**: Tiptap editor integrated with Yjs and `@tiptap/extension-collaboration`.
- [x] **Real-Time Collaboration**: Hocuspocus WebSocket provider with remote cursors, awareness colors, and initials.
- [x] **Local Persistence**: `y-indexeddb` client-side caching enabling document survival across reloads and offline edits.
- [x] **Offline Reconciliation**: Already-loaded documents remain editable while disconnected; edits seamlessly merge upon reconnect.
- [x] **Server Persistence**: PostgreSQL document store with binary `BYTEA` Yjs update encoding, debounced writes, and automatic table creation.
- [x] **Zero-Config Database Fallback**: Built-in high-fidelity in-memory persistence adapter when PostgreSQL is not running.
- [x] **Document Isolation**: Clean separation between distinct document IDs.
- [x] **End-to-End Automated Testing**: Playwright multi-context tests verifying convergence, offline merge, page refresh survival, document isolation, and server restart restore.

---

## Milestone 2: Accounts, Workspaces, and Authorized Documents (Completed)

- [x] **User Accounts & Sessions**: Name/email/password registration, login, logout, and server-validated revocable sessions.
- [x] **Cookie & Endpoint Security**: HttpOnly `SameSite=Lax` session cookies, CSRF protection headers, sliding-window rate limiting, and bcryptjs hashing.
- [x] **PostgreSQL Schema Migrations**: Versioned migrations for `users`, `sessions`, `workspaces`, `workspace_members`, and `workspace_documents`.
- [x] **Workspace Roles & Membership**: Role-based access control with `owner`, `editor`, and `viewer` roles, member management modal, and last-owner protection.
- [x] **Active Connection Revocation & Session Expiration**: Real-time termination of active document connections upon member removal and logout across tabs; dynamic role downgrade from editor to viewer on active connections; 5-second periodic session sweep to terminate expired/revoked idle connections.
- [x] **Protocol-Level Write Enforcement & Offline Revocation**: Server rejects Yjs protocol write updates from viewers; offline editor edits are rejected upon reconnection if access was revoked or downgraded; unauthorized edits are prevented from reaching peer clients or PostgreSQL.
- [x] **Comprehensive Testing Suite**: 17 automated Playwright tests and server restart persistence unit test verifying all auth, permissions, active revocation, offline revocation, regression mappings, cache isolation, and process-restart persistence flows against isolated `syncraft_test` database.

---

## Milestone 3: Persistent, Real-Time Project Boards (Completed)

- [x] **Relational Schema & Migrations**: Versioned migration `v3` introducing `project_boards`, `board_columns`, `tasks`, and `idempotency_keys` with foreign keys and composite indexes.
- [x] **Board & Column Workflows**: Board creation with default columns ("To Do", "In Progress", "Done"), column renaming, dense reordering, and rejection of non-empty column deletion.
- [x] **Task Workflows & Permitted Assignees**: Task creation, editing (title, plain-text description, priority, due date, workspace member assignee), archiving, and restoring. Non-members rejected from assignment.
- [x] **Authoritative Ordering & Concurrency Control**: Dense 0-indexed contiguous positions, row-level transaction locks (`SELECT ... FOR UPDATE`), Optimistic Concurrency Control (`version` integer with HTTP 409 conflict detection), and idempotency key duplicate prevention.
- [x] **Real-Time Synchronization via Server-Sent Events (SSE)**: Transaction-committed event publishing (`/api/boards/:id/events`), monotonic sequence counters (`seq`) with gap detection and auto-recovery, and active session/membership termination propagation.
- [x] **Live-Connection Scope & Accessible UI**: Offline detection with disabled mutation actions and warning banner; drag-and-drop combined with keyboard-accessible move controls; task count indicators, title search, priority/assignee filters, and archived tasks drawer.
- [x] **Regression & E2E Test Suite**: 8 comprehensive board E2E tests covering persistence, live multi-user sync, concurrent moves, OCC conflict handling, retried creation idempotency, permission guards, session revocation, and keyboard movement, preserving all 17 Milestone 2 tests (25/25 total E2E passing).

---

## Milestone 4: Collaborative Document Version History, Preview & Safe Restoration (Completed)

- [x] **PostgreSQL Schema & Migrations**: Versioned migration `v4` creating `document_checkpoints` and `restore_idempotency_keys` with foreign keys and composite indexing `(document_id, created_at DESC)`.
- [x] **Authoritative Checkpoint Model**: Capture document snapshots from live in-memory Y.Doc, accounting for debounced persistence. Checkpoint kinds: `manual`, `automatic`, and `pre_restore`.
- [x] **Honest Multi-User Attribution**: Automatic checkpoints labeled as "Automatic Checkpoint" with `created_by = NULL`, avoiding misattribution of multi-user documents to the last editor.
- [x] **Automatic Checkpoint Deduplication**: Periodic background scheduler (5-minute interval) checks SHA-256 content hashes and skips unchanged content without duplicate checkpoints.
- [x] **Isolated Read-Only Preview & LCS Text Diffing**: Checkpoint preview initializes an isolated, disconnected Y.Doc in memory; line-level LCS added/removed text diff compared against live state; explanatory notes on rich-text versus structure comparison.
- [x] **Safe Live Restoration Under Collaboration**: Historical versions restored as an atomic live change replacing XML fragments (`liveDoc.transact(...)`), broadcasting standard CRDT updates over active WebSockets to all connected peers without clobbering server in-memory state.
- [x] **Concurrency Conflict Rejection (OCC) & Pre-Restore Recovery**: Validates `expected_base_hash` against live state, returning `HTTP 409 Conflict` if intervening edits occur; automatic `pre_restore` snapshot enables immediate reversal of restorations.
- [x] **Restoration Idempotency & Offline Merge Contract**: Network retry idempotency keys; offline edits reconnecting after a restoration merge deterministically via CRDT without data loss.
- [x] **Role-Based History Permissions**: Owners and editors can save versions and restore; viewers can inspect and diff; non-members denied access (HTTP 403).
- [x] **Automated Regression & E2E Testing**: 7 comprehensive Milestone 4 Playwright tests, 10 board tests (including reconnection recovery and archived task column deletion safety), 17 Milestone 2 tests, and server restart test all passing (35 automated tests total).

---

## Milestone 5: Comments, Mentions & Notifications (Deferred)

- Inline text comments and card discussion threads with resolve states.
- User @mentions with in-app notification center.

---

## Milestone 6: Mobile Client & Advanced Analytics (Deferred)

- Cross-platform mobile client utilizing the same Yjs synchronization protocol.
- Workspace audit logs and activity heatmaps.
