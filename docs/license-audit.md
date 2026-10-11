# Syncraft Dependency & License Audit

This document records the licensing audit conducted for Syncraft ahead of public release. The audit analyzed all direct and transitive dependencies across `apps/web`, `apps/server`, and `packages/e2e` against package manifests, resolved lockfiles (`pnpm-lock.yaml`), upstream license texts, and compiled Rollup build metadata.

**Audit Date**: October 11, 2026  
**Auditor**: Automated repository inspection with manual verification  
**Project License**: MIT License (Copyright (c) 2026 luqisdev)

---

## 1. Summary of Package Totals & Methodology

To avoid ambiguous claims, dependencies are categorized into three distinct operational scopes:

### A. Combined Production Dependencies (Web + Server Runtimes)
Running `pnpm --filter @syncraft/web licenses list --prod --json` and `pnpm --filter @syncraft/server licenses list --prod --json` yields:
- **Web Production Runtime Dependencies**: 83 resolved packages.
- **Server Production Runtime Dependencies**: 26 resolved packages.
- **Shared Packages** (present in both runtimes): 6 packages (`@hocuspocus/common@2.15.3`, `isomorphic.js@0.2.5`, `lib0@0.2.119`, `ws@8.22.0`, `y-protocols@1.0.7`, `yjs@13.6.33`).
- **Total Unique Production Packages**: **103 packages** (`83 + 26 - 6 = 103`).

**Production Licenses Breakdown (103 unique packages)**:
| License Category | Package Count | Representative Packages |
| :--- | :--- | :--- |
| **MIT** | 96 | React, ReactDOM, Yjs, Tiptap, Hocuspocus, pg, ProseMirror libraries |
| **ISC** | 3 | `lucide-react@0.479.0`, `pg-int8@1.0.1`, `split2@4.2.0` |
| **BSD-2-Clause** | 2 | `dotenv@16.6.1`, `entities@4.5.0` |
| **BSD-3-Clause** | 1 | `bcryptjs@3.0.3` |
| **Python-2.0** | 1 | `argparse@2.0.1` (transitive tree of `@tiptap/pm`; see bundle verification below) |
| **Total** | **103** | **Exact reconciliation with resolved lockfile** |

---

### B. Bundled Frontend Distribution Modules (Actual Compiled Artifacts)
During client production compilation (`pnpm run build`), Vite and Rollup process JavaScript modules and tree-shake unreferenced code. `rollup-plugin-license` inspects the build's module graph to produce [`dist/assets/vendor.LICENSE.txt`](../apps/web/dist/assets/vendor.LICENSE.txt).

- **Total Packages Included in Web Bundle**: **47 packages**
  - **MIT**: 46 packages
  - **ISC**: 1 package (`lucide-react@0.479.0`)

All 47 bundled packages are permissive (MIT or ISC). No copyleft or proprietary code is included in web assets distributed to end users.

---

### C. Development & Tooling Dependencies (Repository-Wide)
Running `pnpm licenses list --json` across the entire workspace (including root devDependencies and `packages/e2e`) yields **95 unique packages**:
- `MIT`: 69 packages (ESLint plugins, tsx, vite, etc.)
- `Apache-2.0`: 13 packages (`typescript@5.9.3`, `@eslint/*`, `@humanfs/*`, `eslint-visitor-keys`, etc.)
- `BSD-2-Clause`: 6 packages (`eslint-scope`, `espree`, `esrecurse`, `estraverse`, `esutils`, `uri-js`)
- `ISC`: 5 packages (`flatted`, `glob-parent`, `isexe`, `semver`, `which`)
- `BSD-3-Clause`: 1 package (`esquery`)
- `BlueOak-1.0.0`: 1 package (`minimatch@10.2.6`)

All development tools are permissively licensed. None are distributed in end-user binaries or web assets.

---

## 2. Bundled Module Verification & Upstream Transitive Audit

### A. Rollup Module Graph vs. Transitive Dependencies
In package-manager dependency trees, `@tiptap/pm` transitively pulls `prosemirror-markdown`, which depends on `markdown-it`, which in turn depends on `argparse` (`Python-2.0`) and `entities` (`BSD-2-Clause`).

- **Verification Method**: Rather than relying on simple text grep across minified code, the module inclusion graph was audited using `rollup-plugin-license` during Vite production compilation.
- **Findings**:
  - `apps/web` does not import or invoke markdown parsing or serialization.
  - Rollup's module resolver confirmed that neither `argparse` nor `markdown-it` is included in the output bundle chunks.
  - The generated `dist/assets/vendor.LICENSE.txt` confirms that neither `argparse` nor `markdown-it` appears among the 47 bundled runtime packages.
  - Although excluded from the bundle, `argparse` remains documented in the repository dependency inventory in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) because it exists in the lockfile and node_modules tree.

### B. Lucide Icons Attribution
- **Package**: `lucide-react@0.479.0` (ISC License).
- **Upstream Notice**:
  ```text
  ISC License

  Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
  ```
  Both the Feather attribution and Lucide Contributors copyright are explicitly preserved in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and in the compiled bundle notice.

### C. Apache-2.0 Development Dependencies & NOTICE Files
- Development tools licensed under Apache-2.0 (such as `typescript@5.9.3` and ESLint core packages) include standard Apache copyright notices.
- `typescript` contains an upstream `ThirdPartyNotices.txt` documenting components like WebGL and Unicode data. Because TypeScript is an offline compiler tool not redistributed in Syncraft releases, these notices apply to the development environment.

---

## 3. License Compatibility & Scope

- **Original Syncraft Material**: Released under the MIT License by `luqisdev` (see [`LICENSE`](../LICENSE)).
- **Third-Party Material**: Retains respective upstream copyrights and permissive licenses (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, Python-2.0).
- **Copyleft Assessment**: 0 copyleft packages (GPL, AGPL, LGPL, MPL, EPL) are present anywhere in the project or its dependency tree.
- **Composite Compatibility**: Permissive licenses (MIT, ISC, BSD) are fully compatible with an MIT-licensed application.

---

## 4. Honest Limitations & Disclaimers

- This audit represents an engineering review of package manifests, lockfiles, and compiler module graphs. It does not constitute formal legal counsel.
- Syncraft was developed with AI assistance (Google DeepMind Antigravity). No claim of sole independent human authorship of all generated code is made. Original architecture, logic, and test suites are released under the MIT License by `luqisdev`.
