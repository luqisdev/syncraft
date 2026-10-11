# Syncraft Dependency & License Audit

This document records the licensing audit conducted for Syncraft ahead of public release. The audit analyzed all direct and transitive dependencies across `apps/web`, `apps/server`, and `packages/e2e` against upstream package manifests, license texts, and dependency trees.

**Audit Date**: October 11, 2026  
**Auditor**: Automated repository inspection with manual verification  
**Project License**: MIT License (Copyright (c) 2026 luqisdev)

---

## 1. Summary of Findings

- **Total Production Dependencies Audited**: 72 packages across web and server runtimes.
- **Licenses Present in Production Runtimes**:
  - `MIT`: 64 packages (e.g. React, Yjs, Tiptap, Hocuspocus, pg, ProseMirror)
  - `ISC`: 4 packages (`lucide-react`, `pg-int8`, `split2`)
  - `BSD-2-Clause`: 2 packages (`dotenv`, `entities`)
  - `BSD-3-Clause`: 1 package (`bcryptjs`)
- **Copyleft (GPL / AGPL / LGPL) Dependencies**: **0 detected**. No copyleft dependencies exist in either runtime or devDependencies.
- **Proprietary / Unknown Dependencies**: **0 detected**.
- **License Compatibility**: All identified licenses (MIT, ISC, BSD-2-Clause, BSD-3-Clause) are permissive and compatible with an MIT-licensed composite application.

---

## 2. In-Depth Component Analysis

### A. Tiptap & Hocuspocus Ecosystem
- **Packages**:
  - `@tiptap/core` (`2.27.3`), `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `@tiptap/extension-placeholder`, `@tiptap/pm`
  - `@hocuspocus/server` (`2.15.3`), `@hocuspocus/provider` (`2.15.3`), `@hocuspocus/common` (`2.15.3`)
- **Upstream License**: MIT License (Tiptap GmbH / ueberdosis).
- **Verification Note**: Certain enterprise extensions in the broader Tiptap ecosystem require commercial licenses (e.g., Tiptap Pro / Collaboration Cloud). Syncraft uses exclusively the open-source community packages licensed under MIT, connected to an in-house `@hocuspocus/server` instance and native PostgreSQL.

### B. ProseMirror Foundation
- **Packages**: `prosemirror-model`, `prosemirror-view`, `prosemirror-state`, `prosemirror-transform`, `prosemirror-commands`, `prosemirror-keymap`, `prosemirror-history`, `prosemirror-dropcursor`, `prosemirror-gapcursor`, `prosemirror-schema-basic`, `prosemirror-schema-list`.
- **Upstream License**: MIT License (Copyright (c) Marijn Haverbeke and contributors).

### C. CRDT State Layer (Yjs Ecosystem)
- **Packages**: `yjs` (`13.6.33`), `y-indexeddb` (`9.0.12`), `y-protocols` (`1.0.7`), `y-prosemirror` (`1.3.7`), `lib0` (`0.2.119`).
- **Upstream License**: MIT License (Copyright (c) Kevin Jahns).

### D. Icons & Visual Assets
- **Package**: `lucide-react` (`0.479.0`).
- **License**: ISC License (Copyright (c) Lucide Contributors / Cole Bemis).
- **Obligation**: The ISC license requires retaining the copyright notice and permission text. Handled in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and automatically in `dist/assets/vendor.LICENSE.txt`.

### E. Fonts & Embedded Media
- **Fonts**: System native font stack only (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`). No web fonts are bundled or requested remotely.
- **Images**: All screenshots in `docs/screenshots/` are synthetic test captures created during project verification.

### F. Transitive Artifact Verification: `argparse` & `markdown-it`
- **Context**: A transitive dependency, `argparse` (`2.0.1`, Python-2.0 license), appeared in dependency tree analysis via `@tiptap/pm` -> `prosemirror-markdown` -> `markdown-it`.
- **Verification**: Inspected the production web build bundle (`dist/assets/index-*.js`). Because Syncraft does not import or execute markdown serialization at runtime, Rollup's tree-shaking completely stripped `argparse` and `markdown-it` from the bundle. Neither is included in redistributed frontend artifacts.

---

## 3. Automation & Continuous Attribution

To ensure third-party notices remain accurate as dependencies evolve:
1. `apps/web/vite.config.ts` integrates `rollup-plugin-license`, extracting all bundled third-party licenses into `dist/assets/vendor.LICENSE.txt` whenever `pnpm run build` is executed.
2. Root-level attribution is maintained manually and verified in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

---

## 4. Limitations & Disclaimers

- This audit represents an engineering review of license declarations, package manifests, and repository files. It does not constitute formal legal counsel.
- Syncraft was developed with AI assistance (Google DeepMind Antigravity). No claim of sole independent human authorship of all generated code is made. Original architecture, logic, and test suites are released under the MIT License by `luqisdev`.
