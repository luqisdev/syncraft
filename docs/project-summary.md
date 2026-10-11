# Syncraft Project Summary & Architectural Case Study

## 1. Project Description

**Syncraft** is an open-source real-time collaborative workspace platform combining conflict-free document editing (Yjs CRDTs) and transactional project management boards over WebSockets and Server-Sent Events (SSE). Backed by native PostgreSQL, it focuses on the hard problems in collaborative software: server-enforced mid-session authorization revocation, authoritative version restoration with offline draft rescue, and transactional optimistic concurrency control.

---

## 2. CV / Resume Bullet Drafts

- **Real-Time Collaboration Engine**: Engineered a full-stack collaborative workspace in TypeScript using Yjs CRDTs, WebSocket transports, and native PostgreSQL, delivering conflict-free concurrent editing with remote cursor awareness and deterministic convergence across multiple authenticated browser sessions.
- **Server-Enforced Authorization & Session Revocation**: Implemented a security architecture with bcrypt hashing, HttpOnly session validation, and mid-session connection sweeping that terminates active WebSocket connections and SSE feeds immediately upon workspace role demotions or membership removals.
- **Resilient Versioning & Offline Restoration**: Designed a multi-user document versioning system with immutable binary checkpoints, isolated read-only previews, and an authoritative restoration revision cursor that detects server-side restores during client disconnections and surfaces non-destructive draft recovery.

---

## 3. Five Architectural Decisions and Their Tradeoffs

### Decision 1: Yjs CRDTs with Debounced PostgreSQL Bytea Persistence
- **Context**: Collaborative documents require conflict-free merging across multiple concurrent typists while guaranteeing durable persistence to an ACID relational database.
- **Implementation**: In-memory Y.Docs receive real-time binary update deltas over WebSockets via `@hocuspocus/server`. Document state is serialized into binary `BYTEA` snapshots and stored in PostgreSQL with a 1-second debounce (max debounce 5 seconds) to prevent database write starvation under high-velocity keystrokes.
- **Tradeoffs**:
  - *Benefits*: Flawless real-time convergence without central lock contention; minimal database I/O overhead during rapid typing bursts.
  - *Drawbacks*: If the server crashes abruptly within the 1-second debounce window before a flush, keystrokes typed within that window rely on client IndexedDB caches rather than PostgreSQL.

### Decision 2: Mid-Session Connection Sweeping vs Per-Message Token Verification
- **Context**: In traditional WebSocket systems, token verification occurs solely during the initial handshake. If a user is downgraded to a Viewer or removed from a workspace mid-session, they could continue editing over an already-open socket.
- **Implementation**: Syncraft maintains an active connection manager with two enforcement layers: immediate event-driven termination when an owner changes member roles via REST endpoints, paired with a 5-second background session sweep across all open document connections to verify database session validity.
- **Tradeoffs**:
  - *Benefits*: Closed loop security with immediate termination upon administrative revocation; read-only enforcement at the server wire level (`beforeHandleMessage`).
  - *Drawbacks*: Periodic database queries against `sessions` and `workspace_members` scale linearly with active connection count on a single node unless cached or distributed via pub/sub.

### Decision 3: Protocol Separation: WebSockets for CRDTs vs SSE for Kanban Boards
- **Context**: Project boards have discrete, structured transactional requirements (columns, task assignments, ordering) that differ fundamentally from character-by-character document streams.
- **Implementation**: Collaborative document editing uses full-duplex binary WebSockets (Yjs protocol). Kanban boards use standard REST mutations backed by PostgreSQL transactions with `SELECT ... FOR UPDATE` row locks, broadcasting change events to subscribers over lightweight HTTP Server-Sent Events (SSE).
- **Tradeoffs**:
  - *Benefits*: Clean domain separation; ACID ordering guarantees with dense integer indexing (`0, 1, 2...`); eliminates CRDT overhead for structured relational data.
  - *Drawbacks*: Clients maintain two distinct network transport channels when viewing both documents and boards concurrently.

### Decision 4: Authoritative Restoration Revision Cursor vs Clock-Based Timestamp Matching
- **Context**: Restoring a document to an earlier checkpoint replaces the shared Yjs XML fragment. If a client was disconnected and edited locally, standard CRDT merging would attach their offline edits to deleted XML nodes, making them invisible in the live editor.
- **Implementation**: When a restoration completes successfully on the server, an authoritative monotonic integer cursor (`restorations.revision`) advances. Connected clients record this revision. Disconnected clients check the authoritative cursor upon reconnection. If the server revision exceeds the client's stored baseline, a conflict recovery modal appears with the user's offline text intact.
- **Tradeoffs**:
  - *Benefits*: Eliminates reliance on client-server clock alignment; prevents false positive warnings on rejected restore attempts (HTTP 409); guarantees offline thoughts are never silently discarded.
  - *Drawbacks*: Restoration replace-all semantics operate at the fragment level; rich inline formatting marks from offline drafts are preserved as clean plain-text recovery drafts rather than reconstructed CRDT attribute trees.

### Decision 5: Native Vanilla CSS Design Tokens vs Utility-First CSS Framework
- **Context**: The web application needed high visual fidelity (dark mode, typography hierarchy, responsive drawers, custom scrollbars) with minimal bundle size and maximum predictability.
- **Implementation**: Authored a consolidated design system directly in `index.css` using CSS custom properties (`--bg-primary`, `--accent-blue`, `--radius-md`, etc.) and semantic component classes.
- **Tradeoffs**:
  - *Benefits*: Zero build-step CSS overhead (no PostCSS or Tailwind compiling); clean CSS bundle (14.4 kB total gzipped); complete control over complex modals and diff styling.
  - *Drawbacks*: Utility classes cannot be rapidly composed inline in JSX; requires disciplined maintenance of standard class names and tokens across components.

---

## 4. Honest Account of AI-Assisted Development

*Note for Project Owner / Portfolio Presentation: Adapt this section to reflect your personal process and contributions.*

- **Human Architectural Ownership**:
  - Formulated the high-level system requirements, multi-tenancy model, permission matrix, and verification standards.
  - Established the architectural boundary separating document CRDT synchronization from relational Kanban board state.
  - Identified critical edge cases in collaborative systems, including mid-session authorization leaks, clock drift during offline recovery, and race conditions during simultaneous version restoration.
- **AI-Assisted Collaboration**:
  - Used DeepMind's Antigravity AI coding assistant to iteratively explore API scaffolding, scaffold database migration schemas, and rapidly prototype responsive layouts.
  - Leveraged AI agent tooling to execute automated browser regressions via Playwright, generating realistic test fixtures across concurrent multi-browser contexts.
  - Refined UI styling issues (such as resolving unstyled button inheritance and responsive header overflow) through automated screenshot inspection and CSS token consolidation.
- **Verification & Code Review**:
  - Every architectural contract, database query, and concurrency guard was systematically validated through automated unit, integration, and Playwright end-to-end tests before acceptance.
