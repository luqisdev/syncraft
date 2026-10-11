# Third-Party Software Notices & Licenses

Syncraft incorporates, depends upon, or bundles third-party software components licensed under permissive open-source licenses (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Python-2.0, and BlueOak-1.0.0).

This document provides attribution, copyright notices, and license terms applicable to these components. Syncraft's own original code is licensed under the MIT License (see [LICENSE](LICENSE)). Third-party components retain their respective copyrights and licenses as detailed below.

---

## Table of Contents
1. [Bundled Frontend Runtime Dependencies (47 Packages)](#1-bundled-frontend-runtime-dependencies-47-packages)
2. [Server Runtime Dependencies](#2-server-runtime-dependencies)
3. [Unbundled Transitive Dependencies in Web Tree](#3-unbundled-transitive-dependencies-in-web-tree)
4. [Icons & Visual Assets](#4-icons--visual-assets)
5. [Development & Build Toolchain](#5-development--build-toolchain)
6. [Upstream Third-Party License Texts](#6-upstream-third-party-license-texts)

---

## 1. Bundled Frontend Runtime Dependencies (47 Packages)

The following 47 packages are resolved by Vite and Rollup during production compilation and bundled into the web distribution (`apps/web/dist`):

| Package | Version | License | Copyright / Author |
| :--- | :--- | :--- | :--- |
| **react** | `18.3.1` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **react-dom** | `18.3.1` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **scheduler** | `0.23.2` | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| **lucide-react** | `0.479.0` | ISC | Copyright (c) for portions held by Cole Bemis 2013-2022 (Feather); all other (c) 2022 Lucide Contributors. |
| **orderedmap** | `2.1.1` | MIT | Copyright (c) 2016 Marijn Haverbeke |
| **prosemirror-model** | `1.25.12` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-transform** | `1.12.2` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-state** | `1.4.4` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-view** | `1.42.6` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **w3c-keyname** | `2.2.8` | MIT | Copyright (c) 2016 Marijn Haverbeke |
| **prosemirror-keymap** | `1.2.3` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-commands** | `1.7.2` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **prosemirror-schema-list** | `1.5.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **@tiptap/core** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/react** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-blockquote** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-bold** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-bullet-list** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-code** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-code-block** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-document** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **prosemirror-dropcursor** | `1.8.4` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **@tiptap/extension-dropcursor** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **prosemirror-gapcursor** | `1.4.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **@tiptap/extension-gapcursor** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-hard-break** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-heading** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **rope-sequence** | `1.3.4` | MIT | Copyright (c) 2016 Marijn Haverbeke |
| **prosemirror-history** | `1.5.1` | MIT | Copyright (C) 2015-2017 Marijn Haverbeke and others |
| **@tiptap/extension-history** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-horizontal-rule** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-italic** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-list-item** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-ordered-list** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-paragraph** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-strike** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-text** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/starter-kit** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **lib0** | `0.2.119` | MIT | Copyright (c) 2020 Kevin Jahns |
| **yjs** | `13.6.33` | MIT | Copyright (c) 2023 Kevin Jahns |
| **y-prosemirror** | `1.3.7` | MIT | Copyright (c) 2020 Kevin Jahns |
| **@tiptap/extension-collaboration** | `2.27.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@tiptap/extension-collaboration-cursor** | `2.26.2` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@hocuspocus/common** | `2.15.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **@lifeomic/attempt** | `3.1.0` | MIT | Copyright (c) 2018 LifeOmic |
| **@hocuspocus/provider** | `2.15.3` | MIT | Copyright (c) 2021-present Tiptap GmbH / ueberdosis |
| **y-indexeddb** | `9.0.12` | MIT | Copyright (c) 2014 Kevin Jahns |

*(Note: During `pnpm run build`, `rollup-plugin-license` extracts exact full license texts for these 47 bundled packages into `apps/web/dist/assets/vendor.LICENSE.txt`.)*

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
| **yjs** | `13.6.33` | MIT | Copyright (c) 2023 Kevin Jahns |
| **y-protocols** | `1.0.7` | MIT | Copyright (c) 2020 Kevin Jahns |
| **lib0** | `0.2.119` | MIT | Copyright (c) 2020 Kevin Jahns |
| **isomorphic.js** | `0.2.5` | MIT | Copyright (c) 2019 Kevin Jahns |

---

## 3. Unbundled Transitive Dependencies in Web Tree

The following packages are installed into `node_modules` via `@tiptap/pm` dependencies, but verified via Rollup module graph analysis as **excluded** from the compiled web application:

| Package | Version | License | Note |
| :--- | :--- | :--- | :--- |
| **argparse** | `2.0.1` | Python-2.0 | Pulled via `markdown-it`; excluded by Rollup tree-shaking |
| **markdown-it** | `14.3.2` | MIT | Pulled via `prosemirror-markdown`; excluded by Rollup tree-shaking |
| **entities** | `4.5.0` | BSD-2-Clause | Pulled via `markdown-it`; excluded by Rollup tree-shaking |

---

## 4. Icons & Visual Assets

### Lucide Icons
- **Package**: `lucide-react` (version `0.479.0`)
- **License**: ISC License
- **Exact Upstream Notice**:
  ```text
  ISC License

  Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

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

### System Fonts & Screenshots
- **Typography**: Uses system native font stacks (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`). No web font assets are bundled.
- **Screenshots**: Screenshots in `docs/screenshots/` depict original Syncraft user interfaces generated from local synthetic test data.

---

## 5. Development & Build Toolchain

The following development tools are used locally to build, lint, and test Syncraft and are not redistributed to end users:
- **TypeScript** (`5.9.3` / `^5.8.2`): Apache-2.0 License (Copyright (c) Microsoft Corporation)
- **Vite** (`6.4.4`): MIT License (Copyright (c) Evan You & Vite Contributors)
- **ESLint** (`10.12.0`): MIT License (Copyright (c) OpenJS Foundation)
- **Playwright** (`1.50.1`): Apache-2.0 License (Copyright (c) Microsoft Corporation)
- **pnpm**: MIT License (Copyright (c) pnpm contributors)
- **minimatch** (`10.2.6`): BlueOak-1.0.0 (Copyright (c) Isaac Z. Schlueter)

---

## 6. Upstream Third-Party License Texts

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
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA OR PROFITS; OR BUSINESS
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
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

### Python-2.0 License (argparse)
```text
1. This LICENSE AGREEMENT is between the Python Software Foundation ("PSF"), and
the Individual or Organization ("Licensee") accessing and otherwise using this
software ("Python") in source or binary form and its associated documentation.

2. Subject to the terms and conditions of this License Agreement, PSF hereby
grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce,
analyze, test, perform and/or display publicly, prepare derivative works,
distribute, and otherwise use Python alone or in any derivative version,
provided, however, that PSF's License Agreement and PSF's notice of copyright,
i.e., "Copyright (c) 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020 Python Software Foundation;
All Rights Reserved" are retained in Python alone or in any derivative version
prepared by Licensee.

3. In the event Licensee prepares a derivative work that is based on or
incorporates Python or any part thereof, and wants to make the derivative work
available to others as provided herein, then Licensee hereby agrees to include in
any such work a brief summary of the changes made to Python.

4. PSF is making Python available to Licensee on an "AS IS" basis. PSF MAKES NO
REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT
LIMITATION, PSF MAKES NO AND DISCLAIMS ANY REPRESENTATION OR WARRANTY OF
MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF
PYTHON WILL NOT INFRINGE ANY THIRD PARTY RIGHTS.

5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON FOR ANY
INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS A RESULT OF MODIFYING,
DISTRIBUTING, OR OTHERWISE USING PYTHON, OR ANY DERIVATIVE THEREOF, EVEN IF
ADVISED OF THE POSSIBILITY THEREOF.

6. This License Agreement will automatically terminate upon a material breach of
its terms and conditions.

7. Nothing in this License Agreement shall be deemed to create any relationship
of agency, partnership, or joint venture between PSF and Licensee. This License
Agreement does not grant permission to use PSF trademarks or trade name in a
trademark sense to endorse or promote products or services of Licensee, or any
third party.

8. By copying, installing or otherwise using Python, Licensee agrees to be bound
by the terms and conditions of this License Agreement.
```

### Apache License 2.0 (Full Text - Reference for Toolchain Dependencies)
```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work.

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner.

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License.
```
