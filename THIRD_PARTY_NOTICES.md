# Third-Party Software Notices & Licenses

Syncraft incorporates, depends upon, or bundles third-party software components licensed under permissive open-source licenses (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Python-2.0, and CC-BY-4.0).

This document provides attribution, copyright notices, and license terms applicable to these components. Syncraft's own original code is licensed under the MIT License (see [LICENSE](LICENSE)). Third-party components retain their respective copyrights and licenses as detailed below.

---

## Table of Contents
1. [Bundled Frontend Runtime Dependencies](#1-bundled-frontend-runtime-dependencies)
2. [Server Runtime Dependencies](#2-server-runtime-dependencies)
3. [Icons & Visual Assets](#3-icons--visual-assets)
4. [Development & Build Toolchain](#4-development--build-toolchain)
5. [Upstream Third-Party License Texts](#5-upstream-third-party-license-texts)

---

## 1. Bundled Frontend Runtime Dependencies

The following packages are bundled into the production web application (`apps/web`):

| Package | Version | License | Copyright / Author |
| :--- | :--- | :--- | :--- |
| **react** | `18.3.1` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **react-dom** | `18.3.1` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **scheduler** | `0.23.2` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **use-sync-external-store** | `1.7.0` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **lucide-react** | `0.479.0` | ISC | Copyright (c) Lucide Contributors / Cole Bemis |
| **yjs** | `13.6.33` | MIT | Copyright (c) 2023 Kevin Jahns |
| **y-indexeddb** | `9.0.12` | MIT | Copyright (c) 2014 Kevin Jahns |
| **y-protocols** | `1.0.7` | MIT | Copyright (c) 2020 Kevin Jahns |
| **y-prosemirror** | `1.3.7` | MIT | Copyright (c) 2020 Kevin Jahns |
| **lib0** | `0.2.119` | MIT | Copyright (c) 2020 Kevin Jahns |
| **@tiptap/core** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/react** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/starter-kit** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-collaboration** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-collaboration-cursor** | `2.26.2` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-placeholder** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/pm** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@hocuspocus/provider** | `2.15.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@hocuspocus/common** | `2.15.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **prosemirror-model** | `1.24.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-state** | `1.4.3` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-view** | `1.42.6` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-transform** | `1.12.2` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-commands** | `1.6.2` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-history** | `1.4.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-keymap** | `1.2.2` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-inputrules** | `1.4.0` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-dropcursor** | `1.8.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-gapcursor** | `1.3.2` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-schema-basic** | `1.2.3` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-schema-list** | `1.4.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **orderedmap** | `2.1.1` | MIT | Copyright (c) 2016 Marijn Haverbeke |
| **w3c-keyname** | `2.2.8` | MIT | Copyright (c) 2016 Marijn Haverbeke |
| **rope-sequence** | `1.3.4` | MIT | Copyright (c) 2016 Marijn Haverbeke |
| **tippy.js** | `6.3.7` | MIT | Copyright (c) 2017-2021 atomiks |
| **@popperjs/core** | `2.11.8` | MIT | Copyright (c) 2019 Federico Zivolo |
| **fast-deep-equal** | `3.1.3` | MIT | Copyright (c) 2017 Evgeny Poberezkin |
| **entities** | `4.5.0` | BSD-2-Clause | Copyright (c) Felix Boehm |

*(Note: During frontend compilation via `pnpm run build`, full bundled license texts are additionally extracted into `apps/web/dist/assets/vendor.LICENSE.txt` by `rollup-plugin-license`.)*

---

## 2. Server Runtime Dependencies

The following packages execute in the backend service runtime (`apps/server`):

| Package | Version | License | Copyright / Author |
| :--- | :--- | :--- | :--- |
| **@hocuspocus/server** | `2.15.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@hocuspocus/common** | `2.15.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **pg** | `8.23.1` | MIT | Copyright (c) 2010 - 2021 Brian Carlson |
| **pg-pool** | `3.14.0` | MIT | Copyright (c) 2015 Brian M. Carlson |
| **pg-protocol** | `1.16.1` | MIT | Copyright (c) Brian M. Carlson |
| **pg-types** | `2.2.0` | MIT | Copyright (c) 2014 Brian M. Carlson |
| **pg-connection-string** | `2.14.1` | MIT | Copyright (c) 2013 Blaine Bublitz |
| **pg-int8** | `1.0.1` | ISC | Copyright (c) 2014 Charmander |
| **pgpass** | `1.0.5` | MIT | Copyright (c) 2016 Hannes Hörl |
| **postgres-array** | `2.0.0` | MIT | Copyright (c) Ben Drucker |
| **postgres-bytea** | `1.0.1` | MIT | Copyright (c) Ben Drucker |
| **postgres-date** | `1.0.7` | MIT | Copyright (c) Ben Drucker |
| **postgres-interval** | `1.2.0` | MIT | Copyright (c) Ben Drucker |
| **bcryptjs** | `3.0.3` | BSD-3-Clause | Copyright (c) 2012 Nevins Bartolomeo, Daniel Wirtz |
| **cookie** | `2.0.1` | MIT | Copyright (c) 2012-2014 Roman Shtylman, Douglas Christopher Wilson |
| **dotenv** | `16.6.1` | BSD-2-Clause | Copyright (c) 2015 Scott Motte |
| **ws** | `8.22.0` | MIT | Copyright (c) 2011 Einar Otto Stangvik |
| **uuid** | `11.1.1` | MIT | Copyright (c) 2010-2020 Robert Kieffer and other contributors |
| **async-lock** | `1.4.1` | MIT | Copyright (c) 2014 Roger Liu |
| **kleur** | `3.0.3` | MIT | Copyright (c) Luke Edwards |
| **split2** | `4.2.0` | ISC | Copyright (c) 2014-2021 Matteo Collina |
| **xtend** | `4.0.2` | MIT | Copyright (c) 2012-2014 Raynos |

---

## 3. Icons & Visual Assets

### Lucide Icons
- **Package**: `lucide-react` (version `0.479.0`)
- **License**: ISC License
- **Copyright**:
  - Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
  - All other copyright (c) 2022-present Lucide Contributors.

### System & Web Fonts
Syncraft relies on standard platform system font stacks (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). No third-party web font files (WOFF/WOFF2/TTF) are bundled or downloaded from remote CDNs.

### Screenshots & Media Assets
All screenshots in `docs/screenshots/` were generated locally using automated synthetic browser fixtures and depict original Syncraft software interfaces.

---

## 4. Development & Build Toolchain

The following developer tools are utilized to compile, lint, and test Syncraft during development, but are not redistributed to end users:

- **TypeScript** (`5.9.3` / `^5.8.2`): Apache-2.0 License (Copyright (c) Microsoft Corporation)
- **Vite** (`6.4.4`): MIT License (Copyright (c) 2019-present Evan You & Vite Contributors)
- **ESLint** (`10.12.0`): MIT License (Copyright (c) OpenJS Foundation and other contributors)
- **Playwright** (`1.50.1`): Apache-2.0 License (Copyright (c) Microsoft Corporation)
- **pnpm**: MIT License (Copyright (c) pnpm contributors)

---

## 5. Upstream Third-Party License Texts

### ISC License (lucide-react, pg-int8, split2)
```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### BSD 3-Clause License (bcryptjs)
```text
Copyright (c) 2012 Nevins Bartolomeo <nevins.bartolomeo@gmail.com>
Copyright (c) 2012 Daniel Wirtz <dcode@dcode.io>

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

### BSD 2-Clause License (dotenv, entities)
```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

### Apache License 2.0 (TypeScript, Playwright)
```text
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
