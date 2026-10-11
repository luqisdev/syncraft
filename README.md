# Syncraft

Syncraft is a real-time collaborative workspace platform combining conflict-free document editing (Yjs CRDTs) and synchronized Kanban boards over WebSockets and Server-Sent Events (SSE). Backed by native PostgreSQL, it focuses on the engineering challenges of collaborative state: server-enforced mid-session authorization revocation, transactional task ordering with optimistic concurrency control, and immutable document versioning with offline draft rescue.

---

## Key Capabilities

- **Real-Time Collaborative Editor**: Conflict-free text editing powered by Yjs and ProseMirror/Tiptap with remote cursor awareness, formatting tools, and CRDT-based multi-user convergence.
- **Server-Enforced Authorization**: Workspace roles (`owner`, `editor`, `viewer`) validated on the server. Active WebSocket connections and SSE subscriptions are terminated mid-session when membership is revoked. Role downgrades (e.g. editor to viewer) immediately sever write capabilities while preserving authorized read-only access.
- **Persistent Kanban Boards**: Multi-column project boards backed by PostgreSQL transactions with `SELECT ... FOR UPDATE` row locking, dense integer ordering, and optimistic concurrency control (`HTTP 409` conflict alerts on concurrent task edits).
- **Immutable Version History & Safe Restoration**: Named manual checkpoints and scheduled automatic snapshots stored in PostgreSQL. Features isolated read-only previews, line-by-line text diff comparison, and concurrency-guarded restorations with pre-restore snapshots.
- **Resilient Offline Continuity**: Namespaced local device caching via IndexedDB. If an online peer restores an earlier version while a client is offline, Syncraft detects the authoritative revision cursor on reconnection and provides a non-destructive draft recovery modal.
- **Responsive Dark Interface**: Clean, restrained dark theme with accessible contrast, full keyboard navigation in dialogs, and a responsive mobile layout with header action overflow.

---

## Visual Tour

### Collaborative Document Editing & Real-Time Awareness
Multi-user collaboration showing remote cursor presence, participant chips, formatting controls, and accurate connection and local storage status:

![Collaborative Document Editing](docs/screenshots/collaborative-editor.png)

### Persistent Kanban Project Boards
Real-time task boards with dense position ordering, priority tags, assignment validation, and SSE event broadcast:

![Project Boards](docs/screenshots/project-boards.png)

### Document Version History & Text Diff Comparison
Browse immutable checkpoints, view creator attribution, compare line-by-line diffs against live state, and restore safely:

![Document Version History](docs/screenshots/document-history.png)

### Mobile Viewport & Accessible Overflow Layout
Full functionality preserved on compact viewports with readable document titles, comfortable formatting toolbar, and reachable history and collaborator actions:

| Mobile Document View | Mobile Version History Drawer |
|:---:|:---:|
| ![Mobile Editor](docs/screenshots/mobile-editor.png) | ![Mobile History](docs/screenshots/mobile-history.png) |

---

## Architecture & Technology Stack

```
                          ┌─────────────────────────────────────┐
                          │         Web Client (React)          │
                          │   Tiptap • Yjs • IndexedDB Cache   │
                          └───────┬──────────────────────┬──────┘
                                  │                      │
           Binary Yjs Protocol    │                      │  HTTP REST / SSE
           over WebSockets        │                      │  (JSON & Events)
                                  ▼                      ▼
                          ┌─────────────────────────────────────┐
                          │     Syncraft Server (Node.js)       │
                          │  Hocuspocus • Auth Sweeper • SSE    │
                          └──────────────────┬──────────────────┘
                                             │
                                             │  Debounced Bytea Sync &
                                             │  ACID Transactions
                                             ▼
                          ┌─────────────────────────────────────┐
                          │         PostgreSQL Database         │
                          │   documents • workspaces • boards   │
                          │     checkpoints • tasks • users     │
                          └─────────────────────────────────────┘
```

- **Monorepo & Tooling**: pnpm workspaces (`packageManager: pnpm@12.10.1`), TypeScript 5.8+, ESLint (flat config)
- **Web Frontend (`apps/web`)**: React 18, Vite 6, Tiptap/ProseMirror, Yjs, `@hocuspocus/provider`, `y-indexeddb`, Lucide Icons, Vanilla CSS
- **Backend Server (`apps/server`)**: Node.js HTTP runtime, `@hocuspocus/server` (WebSocket collaboration engine), Yjs, PostgreSQL driver (`pg`), bcryptjs, Server-Sent Events (SSE)
- **Database**: PostgreSQL with versioned schema migrations (`documents`, `users`, `sessions`, `workspaces`, `workspace_members`, `project_boards`, `board_columns`, `tasks`, `document_checkpoints`, `idempotency_keys`)
- **End-to-End Testing (`packages/e2e`)**: Playwright multi-context browser suite testing concurrent collaboration, role downgrades, network drops, and server restarts against an isolated test database

---

## System Requirements

- **pnpm**: Exactly `12.10.1` as pinned by the `packageManager` field in `package.json` (or use `corepack enable pnpm`).
- **Node.js**: Developed and verified on Node.js `v24.16.0` (server `@types/node` targets `^22.13.10`; other versions are unverified).
- **PostgreSQL**: Developed and tested against PostgreSQL `18.6` (other major versions are untested).
- **Browser Requirement for E2E Tests**: The current Playwright configuration targets the `msedge` channel (Microsoft Edge). A local Microsoft Edge installation is required to execute the end-to-end suite without config adjustments.

> **Portability Note**: Clean-machine installations outside the current development environment have not been independently tested. Ensure your local PostgreSQL service is running and accessible over standard TCP (port 5432).

---

## Getting Started

### 1. Database Setup
Create separate development and test databases in PostgreSQL using `psql` (or pgAdmin):

```sql
-- 1. Create a dedicated application user
CREATE ROLE syncraft_app WITH LOGIN PASSWORD 'your_secure_password';

-- 2. Create development and test databases
CREATE DATABASE syncraft_dev OWNER syncraft_app;
CREATE DATABASE syncraft_test OWNER syncraft_app;

-- 3. Grant privileges
GRANT ALL PRIVILEGES ON DATABASE syncraft_dev TO syncraft_app;
GRANT ALL PRIVILEGES ON DATABASE syncraft_test TO syncraft_app;
```

### 2. Environment Configuration
Copy the example environment configuration into `.env`:

```bash
cp .env.example .env
```

Adjust the connection strings in `.env` to match your local PostgreSQL credentials:

```ini
PORT=1234
HOST=0.0.0.0
NODE_ENV=development

# Primary development database
DATABASE_URL=postgres://syncraft_app:your_secure_password@127.0.0.1:5432/syncraft_dev

# Dedicated test database (used by automated tests)
TEST_DATABASE_URL=postgres://syncraft_app:your_secure_password@127.0.0.1:5432/syncraft_test

# Client WebSocket connection
VITE_SERVER_URL=ws://127.0.0.1:1234
```

> **Note**: Database schema migrations run automatically on server boot. There is no manual migration command required.

### 3. Install Dependencies & Build
From the repository root (`c:\Project Files\syncraft` or your cloned directory):

```bash
pnpm install
pnpm run build
```

### 4. Running the Development Services
Start the server and web client concurrently from the root directory:

```bash
pnpm run dev
```

Alternatively, start each service in separate terminal windows from the repository root:

```bash
# Terminal 1: Backend Collaboration & API Server (http & ws on port 1234)
pnpm run dev:server

# Terminal 2: Web Client (Vite dev server on port 5173)
pnpm run dev:web
```

Open **http://127.0.0.1:5173** in your browser.

---

## Running Verification & Tests

Automated tests execute against the isolated `syncraft_test` database and require the `TEST_DATABASE_URL` environment variable. All commands below should be executed from the **repository root**:

```bash
# Code quality checks (run from root)
pnpm run lint
pnpm run typecheck

# Server unit & database restart persistence test (run from root)
pnpm run test:server

# Full Playwright End-to-End Suite (Multi-user concurrency, roles, history, boards)
# Requires Microsoft Edge (channel: 'msedge')
pnpm run test:e2e

# Run individual Playwright test files from root using pnpm filter:
pnpm --filter @syncraft/e2e exec playwright test tests/milestone2.spec.ts --project=msedge
pnpm --filter @syncraft/e2e exec playwright test tests/boards.spec.ts --project=msedge
pnpm --filter @syncraft/e2e exec playwright test tests/history.spec.ts --project=msedge

# Alternatively, run directly from packages/e2e:
# cd packages/e2e
# npx playwright test tests/history.spec.ts --project=msedge
```

---

## Important Design Decisions & Honest Limitations

- **Single-Node Deployment Scope**: The active connection manager and SSE broadcaster run within a single Node.js process. In a distributed multi-instance deployment (e.g. Kubernetes cluster), an external pub/sub message bus (such as Redis Pub/Sub or PostgreSQL `LISTEN/NOTIFY`) would be necessary to broadcast session revocations across server replicas.
- **Line-Level Text Diffs**: The version comparison view computes line-level added/removed textual diffs (LCS). Rich-text formatting marks (bold, italic, headings) are rendered in the Read-Only Preview canvas, but the text diff focuses on textual content rather than inline mark alterations.
- **Plain-Text Offline Draft Rescue**: When an online user restores an earlier version while a peer is disconnected, the server replaces the live XML fragment. Disconnected edits typed into replaced paragraphs are rescued as a complete plain-text draft rather than automatically reconstructed as a branched CRDT tree.
- **Storage Growth**: Checkpoints persist full binary Yjs snapshots in PostgreSQL. Listing endpoints are paginated, but automated snapshot pruning policies (e.g. TTL expiration) are deferred.
- **Single-Server Scope**: Boards require an active connection; in-flight mutations interrupted during a network drop reconcile with the server upon reconnection without duplicating tasks.

---

## Additional Documentation

- [Step-by-Step 3–5 Minute Demo Walkthrough](docs/demo.md)
- [Project Summary & Architectural Case Study](docs/project-summary.md)
- [Detailed System Architecture Specification](docs/architecture.md)
- [Dependency & License Audit](docs/license-audit.md)

---

## License & Third-Party Notices

Syncraft's original source code is released under the [MIT License](LICENSE).
Copyright (c) 2026 luqisdev.

Third-party libraries, icons, and dependencies retain their own respective copyrights and permissive open-source licenses (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full attribution and upstream license terms. Full third-party license texts for bundled web assets are additionally extracted during build to `dist/assets/vendor.LICENSE.txt`.
