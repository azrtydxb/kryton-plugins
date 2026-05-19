# Plugins Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap in the kryton-plugins registry, ship real interactive Kanban + Excalidraw, expand four plugins (SRS flashcards, RSS scheduler, templater picker, theme presets), and introduce a real test framework.

**Architecture:** Per-plugin work behind a single shared infra phase. Host (`kryton/`) gets minimal additions: vim deps injection + `replaceFenceAtRange` notes-API helper. Persistence for interactive plugins round-trips through the source code fence. Tests via Vitest at `plugins/<name>/__tests__/`.

**Tech Stack:** Node 20+, Vitest, esm.sh CDN (Excalidraw 0.17.6, SortableJS 1.15.2, fast-xml-parser 4.4.1), `@replit/codemirror-vim` (host-injected), existing plugin API.

**Spec:** [docs/superpowers/specs/2026-05-19-plugins-completion-design.md](../specs/2026-05-19-plugins-completion-design.md)

---

## Phase order & parallelism

```
Phase 0 (DONE — vitest + lint cleanup)
    └── Phase 0.5 (sequential, host-expansion agent — kryton/ repo)
        ├── Phase 1 (parallel: fixes-agent, rss-agent, expansions-agent)
        └── Phase 2 (parallel: kanban-agent, excalidraw-agent, vim-agent)
            └── Phase 3 (sequential: docs-agent → verify-agent)
```

## Phase 0.5 — Host-API expansion (host-expansion agent)

**Why this phase exists:** Phase 0 surfaced that `ClientPluginAPI` is much thinner than the spec assumed. The user approved expanding it. All Phase 1/2 plugin work depends on this landing first.

### Task 0.5.1 — Client `api.notes` namespace

Server-side: add new authenticated route file `kryton/packages/server/src/modules/plugins/routes/builtin-notes.routes.ts` that mounts under `/api/plugin-builtin/notes/*`. Endpoints use the **current user from session** (not userId in URL):
- `GET  /api/plugin-builtin/notes/list?folder=<path>` → JSON `NoteEntry[]`
- `GET  /api/plugin-builtin/notes/get?path=<path>` → `{ path, content, title, modifiedAt }`
- `POST /api/plugin-builtin/notes/create` body `{path, content}` → `{ok:true}`
- `POST /api/plugin-builtin/notes/update` body `{path, content}` → `{ok:true}`
- `DELETE /api/plugin-builtin/notes/delete?path=<path>` → `{ok:true}`
- `POST /api/plugin-builtin/notes/openByPath` body `{path}` → `{ok:true}` (no-op server-side; emits `note:open` event that the client UI listens for)
- `POST /api/plugin-builtin/notes/replaceFenceAtRange` body `{path, range:{startLine,endLine}, newSource}` → `{ok:true}` (reads, splices, writes)

All handlers reuse `notesOps.readNote`/`writeNote`/`scanDirectory` already used by `PluginApiFactory.createNotesApi`.

Client-side: in `kryton/packages/ui/src/plugins/PluginRoot.tsx`'s `buildClientApi`, add:
```ts
const notes = {
  list: (folder?: string) => apiFetch(`/api/plugin-builtin/notes/list${folder?`?folder=${encodeURIComponent(folder)}`:''}`).then(r => r.json()),
  get: (path: string) => apiFetch(`/api/plugin-builtin/notes/get?path=${encodeURIComponent(path)}`).then(r => r.json()),
  getContent: async (path: string) => (await notes.get(path)).content,
  create: (path: string, content: string) => apiFetch('/api/plugin-builtin/notes/create', { method: 'POST', body: JSON.stringify({path, content}), headers: {'Content-Type':'application/json'} }).then(r => r.json()),
  update: (path: string, content: string) => apiFetch('/api/plugin-builtin/notes/update', { method: 'POST', body: JSON.stringify({path, content}), headers: {'Content-Type':'application/json'} }).then(r => r.json()),
  delete: (path: string) => apiFetch(`/api/plugin-builtin/notes/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }).then(r => r.json()),
  openByPath: (path: string) => apiFetch('/api/plugin-builtin/notes/openByPath', { method: 'POST', body: JSON.stringify({path}), headers: {'Content-Type':'application/json'} }).then(r => r.json()),
  replaceFenceAtRange: (path: string, range: {startLine:number,endLine:number}, newSource: string) =>
    apiFetch('/api/plugin-builtin/notes/replaceFenceAtRange', { method: 'POST', body: JSON.stringify({path,range,newSource}), headers: {'Content-Type':'application/json'} }).then(r => r.json()),
};
api.notes = notes;
```

Add the `notes` field to `ClientPluginAPI` interface in `kryton/packages/ui/src/plugins/types.ts` **and** mirror in `kryton-plugins/types/client.d.ts`.

Tests: server-side route tests in `kryton/packages/server/src/modules/plugins/__tests__/builtin-notes.routes.test.ts` covering each endpoint + `replaceFenceAtRange` splice correctness.

### Task 0.5.2 — Client `api.storage` namespace

Same pattern. Routes mounted under `/api/plugin-builtin/storage/*`, **scoped by plugin id** automatically server-side (the route uses the calling plugin's id from a header `X-Kryton-Plugin-Id` set by the client wrapper). Methods: `get(key) / set(key,value) / delete(key) / list(prefix?)`. Backed by the existing `PluginStorageService`.

Client wrapper sets `X-Kryton-Plugin-Id` to the current plugin id (already available in `buildClientApi`'s closure). Add `storage` to `ClientPluginAPI` and `kryton-plugins/types/client.d.ts`.

### Task 0.5.3 — Code-fence renderer signature change

Extend `CodeFenceRendererRegistration.component` props from `{ content, notePath }` to `{ content, notePath, range, source }`:
- `range: { startLine: number; endLine: number }` — line indices in the parsed note source (0-based, inclusive).
- `source: string` — the full original fence block including the backticks (handy for some renderers).

Update **every call site** that renders a fence in the host code (find via grep `registerCodeFenceRenderer\|CodeFenceRenderer`). Pass `range` from the markdown AST during render.

Existing plugin renderers (mermaid, mind-map, dataview, etc.) accept `{content, notePath}` — `range`/`source` are additive and don't break them.

### Task 0.5.4 — Client `api.editor` namespace (DROPPED — replaced by Task 0.5.4b)

**Original plan obsolete:** Host editor is **not CodeMirror 6**. It's a custom editor in `packages/ui/src/editor/view/web/EditorView.web.tsx` with its own `EditorPlugin` interface at `packages/ui/src/editor/state/plugins.ts`. `@replit/codemirror-vim` cannot be used.

### Task 0.5.4b — Client `api.editor` namespace targeting the custom editor

Add to `ClientPluginAPI`:
```ts
editor: {
  registerPlugin(plugin: import("../../editor/state/plugins").EditorPlugin): () => void; // returns disposer
  getActiveState(): import("../../editor/state").EditorState | null;
  dispatch(tr: import("../../editor/state/transaction").Transaction): void;
  onTransaction(cb: (tr, state) => void): () => void;
};
```

Wire to the custom editor's plugin registry. `registerPlugin` adds to the `plugins` prop array on the mounted `<EditorView />`. `getActiveState` returns the currently focused editor's state. `onTransaction` subscribes to every applied transaction (for vim mode tracking, etc.).

If the existing `EditorPlugin` interface lacks an `onKeyDown` hook needed by vim, extend it here:
```ts
export interface EditorPlugin {
  // ... existing
  onKeyDown?(e: KeyboardEvent, state: EditorState): Transaction | null | "prevent-default";
}
```
And invoke from the editor's keydown handler before its native processing — the first plugin whose `onKeyDown` returns non-null wins; `"prevent-default"` swallows the event.

**Vim deps:** No `@replit/codemirror-vim`. Native vim impl lives entirely in the `vim-mode` plugin (Phase 2.C, fully rewritten there). `__krytonPluginDeps` stays as `{ React, ReactDOM }`; remove the stale `vim: () => any` and `getCM` from `kryton-plugins/types/client.d.ts`.

### Task 0.5.5 — Mirror all type changes in `kryton-plugins/types/client.d.ts`

End-state of the file matches the new host `ClientPluginAPI` + `KrytonPluginDeps` exports. `npm run typecheck` in `kryton-plugins` must stay green.

### Task 0.5.6 — Smoke

- `cd kryton && npm run -w @kryton/server test -- builtin-` → new tests pass.
- `cd kryton && npm run -w @kryton/ui typecheck` → green.
- `cd kryton-plugins && npm run typecheck && npm run lint && npm run test` → green.
- Manual: start the dev server; load reading-list (already uses server-side storage so unaffected); verify no regression.

### Task 0.5.7 — Commits

Discrete commits per logical change:
- `feat(server): plugin-builtin notes routes`
- `feat(server): plugin-builtin storage routes`
- `feat(ui): client api.notes/api.storage namespaces`
- `feat(ui): pass range+source to code-fence renderers`
- `feat(ui): inject vim deps + api.editor namespace`
- `feat(types): expand ClientPluginAPI`

---

Phase 1 may start the moment Phase 0 completes. Phase 2 requires Phase 0's `replaceFenceAtRange` helper + vim dep injection. Phase 3 runs after all implementer agents report green.

**File ownership (no agent writes outside its column):**

| Agent | Owns |
|---|---|
| infra | `kryton/packages/ui/src/plugins/PluginRoot.tsx`, `kryton/packages/ui/src/plugins/api/notes.ts`, `kryton/packages/ui/package.json`, `kryton-plugins/types/client.d.ts`, `kryton-plugins/package.json`, `kryton-plugins/vitest.config.js`, `kryton-plugins/scripts/test-plugins.js`, and lint-only mechanical edits in any `plugins/*/(client\|server)/index.js` (unused-param renames + `!=`→`!==`) |
| fixes | `plugins/checklist/**`, `plugins/git-backup/**`, `plugins/templater/**` |
| rss | `plugins/rss-reader/**` |
| expansions | `plugins/flashcards/**`, `plugins/theme-settings/**` |
| kanban | `plugins/kanban/**` |
| excalidraw | `plugins/excalidraw/**` |
| vim | `plugins/vim-mode/**` |
| docs | `README.md`, `docs/PLUGIN_API.md`, `docs/CONTRIBUTING.md` |

---

# Phase 0 — Infrastructure (infra agent)

## Task 0.1 — Add Vitest

**Files:**
- Modify: `kryton-plugins/package.json`
- Create: `kryton-plugins/vitest.config.js`

- [ ] **Step 1: Add devDeps**

Edit `kryton-plugins/package.json` — add to `devDependencies`:
```json
"vitest": "^2.1.0",
"jsdom": "^25.0.0"
```
Change `"test"` script to:
```json
"test": "node scripts/test-plugins.js && vitest run",
"test:unit": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Vitest config**

Create `kryton-plugins/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['plugins/**/__tests__/**/*.test.js'],
    environment: 'node',
    globals: false,
    coverage: { reporter: ['text', 'html'], include: ['plugins/**/*.js'], exclude: ['**/__tests__/**'] }
  }
});
```

- [ ] **Step 3: Install & smoke-test**

Run: `cd kryton-plugins && npm install && npm run test:unit -- --reporter=verbose`
Expected: "No test files found" (zero tests yet) — exit 0.

- [ ] **Step 4: Commit**

```bash
git -C kryton-plugins add package.json package-lock.json vitest.config.js
git -C kryton-plugins commit -m "chore: add vitest as plugin test runner"
```

## Task 0.2 — `replaceFenceAtRange` host API

**Files:**
- Modify: `kryton/packages/ui/src/plugins/api/notes.ts` (existing file — locate it; if path differs, search for `getNoteContent`)
- Modify: `kryton-plugins/types/client.d.ts`

- [ ] **Step 1: Add helper**

In the notes-API host file, add:
```ts
async function replaceFenceAtRange(
  path: string,
  range: { startLine: number; endLine: number },
  newSource: string
): Promise<void> {
  const content = await getNoteContent(path);
  const lines = content.split('\n');
  const before = lines.slice(0, range.startLine);
  const after = lines.slice(range.endLine + 1);
  const next = [...before, ...newSource.split('\n'), ...after].join('\n');
  await updateNote(path, next);
}
```
Add to the exported API object as `replaceFenceAtRange`.

- [ ] **Step 2: Declare in client types**

In `kryton-plugins/types/client.d.ts`, add to the `notes` block of `ClientPluginAPI`:
```ts
notes: {
  // ... existing
  openByPath(path: string): Promise<void>;
  getContent(path: string): Promise<string>;
  update(path: string, content: string): Promise<void>;
  replaceFenceAtRange(
    path: string,
    range: { startLine: number; endLine: number },
    newSource: string
  ): Promise<void>;
};
```
(Verify `openByPath` / `getContent` / `update` already exist in the host implementation; if not, surface to user via a status comment in commit message — do **not** invent.)

- [ ] **Step 3: Typecheck**

Run: `cd kryton-plugins && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git -C kryton add packages/ui/src/plugins/api/notes.ts
git -C kryton commit -m "feat(ui): add replaceFenceAtRange plugin API helper"
git -C kryton-plugins add types/client.d.ts
git -C kryton-plugins commit -m "feat(types): declare replaceFenceAtRange in plugin API"
```

## Task 0.3 — Inject vim into `__krytonPluginDeps`

**Files:**
- Modify: `kryton/packages/ui/package.json`
- Modify: `kryton/packages/ui/src/plugins/PluginRoot.tsx`

- [ ] **Step 1: Add dep**

Add `"@replit/codemirror-vim": "^6.2.1"` to `kryton/packages/ui/package.json` `dependencies`.
Run: `cd kryton && pnpm install` (or `npm install` depending on workspace manager — detect from lockfile).

- [ ] **Step 2: Wire injection**

In `kryton/packages/ui/src/plugins/PluginRoot.tsx`, around line 44 where `__krytonPluginDeps` is assigned:
```tsx
import { vim, Vim, getCM } from "@replit/codemirror-vim";
// ...
window.__krytonPluginDeps = {
  React,
  ReactDOM,
  vim,
  Vim,
  getCM,
};
```

- [ ] **Step 3: Update plugin-side type**

`kryton-plugins/types/client.d.ts` already declares `vim` and `getCM` — add `Vim`:
```ts
export interface KrytonPluginDeps {
  React: typeof import("react");
  ReactDOM: typeof import("react-dom");
  vim: () => any;
  Vim: any;
  getCM: (view: any) => any;
}
```

- [ ] **Step 4: Typecheck both sides**

Run:
```bash
cd kryton-plugins && npm run typecheck
cd kryton && pnpm -F @kryton/ui typecheck  # or equivalent
```

- [ ] **Step 5: Commit**

```bash
git -C kryton add packages/ui/package.json packages/ui/src/plugins/PluginRoot.tsx
git -C kryton commit -m "feat(ui): inject @replit/codemirror-vim into __krytonPluginDeps"
git -C kryton-plugins add types/client.d.ts
git -C kryton-plugins commit -m "feat(types): add Vim to KrytonPluginDeps"
```

## Task 0.4 — Lint cleanup (mechanical)

**Files:**
- Modify: `plugins/mermaid-diagrams/client/index.js:31` — rename `notePath` → `_notePath`
- Modify: `plugins/mind-map/client/index.js:45,73` — rename `_` → `__` or remove if dead
- Modify: `plugins/pomodoro/client/index.js:2` — remove unused `useRef`, `useCallback`
- Modify: `plugins/presentation/client/index.js:2` — remove unused `h`, `useState`, `useEffect`, `useCallback`
- Modify: `plugins/publish/client/index.js:2` — remove unused `h`, `useState`
- Modify: `plugins/rss-reader/server/index.js:20` — change `!=` to `!==`
- Modify: `plugins/slash-commands/client/index.js:2` — remove unused `useRef`

- [ ] **Step 1: Apply edits using Edit tool per file**

For each file, make the targeted change. Do not touch surrounding logic.

- [ ] **Step 2: Verify**

Run: `cd kryton-plugins && npm run lint`
Expected: `0 warnings, 0 errors`.

- [ ] **Step 3: Commit**

```bash
git -C kryton-plugins add plugins/
git -C kryton-plugins commit -m "chore: resolve all lint warnings"
```

---

# Phase 1 — Fixes & expansions (parallel)

## Task 1.A — checklist navigation fix (fixes agent)

**Files:**
- Modify: `plugins/checklist/client/index.js`
- Create: `plugins/checklist/__tests__/parser.test.js`
- Create: `plugins/checklist/parser.js` (extract parser for testability)

- [ ] **Step 1: Extract parser**

Move the regex-based checkbox extraction into `plugins/checklist/parser.js`:
```js
// CJS for compatibility with vitest default
module.exports.extractCheckboxes = function extractCheckboxes(noteContent, notePath) {
  const lines = noteContent.split('\n');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s+\[( |x|X)\]\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    items.push({ path: notePath, line: i + 1, checked: m[2].toLowerCase() === 'x', text: m[3].trim() });
  }
  return items;
};
```

- [ ] **Step 2: Failing test**

Create `plugins/checklist/__tests__/parser.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { extractCheckboxes } = require('../parser.js');

describe('extractCheckboxes', () => {
  it('returns empty for note with no checkboxes', () => {
    expect(extractCheckboxes('plain text', 'a.md')).toEqual([]);
  });
  it('parses unchecked and checked items', () => {
    const md = '- [ ] todo\n- [x] done\n  - [X] indented';
    expect(extractCheckboxes(md, 'n.md')).toEqual([
      { path: 'n.md', line: 1, checked: false, text: 'todo' },
      { path: 'n.md', line: 2, checked: true, text: 'done' },
      { path: 'n.md', line: 3, checked: true, text: 'indented' },
    ]);
  });
  it('ignores non-checkbox bullets', () => {
    expect(extractCheckboxes('- plain bullet\n- [ ] real', 'n.md')).toHaveLength(1);
  });
});
```

Run: `npx vitest run plugins/checklist` — expect FAIL until parser module exists, then PASS.

- [ ] **Step 3: Fix navigation in client**

In `plugins/checklist/client/index.js`, find the navigate-on-click handler that calls `api.api.fetch('/notes/${path}')` and replace with:
```js
await api.notes.openByPath(item.path);
```
Remove the silent `.catch(() => {})`.

- [ ] **Step 4: Verify lint + tests**

```bash
cd kryton-plugins && npm run lint && npm run test
```

- [ ] **Step 5: Commit**

```bash
git add plugins/checklist
git commit -m "fix(checklist): use api.notes.openByPath; extract parser; add tests"
```

## Task 1.B — git-backup shell-injection hardening (fixes agent)

**Files:**
- Modify: `plugins/git-backup/server/index.js`
- Create: `plugins/git-backup/__tests__/safe-args.test.js`
- Create: `plugins/git-backup/safe-args.js`

- [ ] **Step 1: Extract argv builder**

`plugins/git-backup/safe-args.js`:
```js
module.exports.buildCommitArgs = function buildCommitArgs({ message, allFiles = true }) {
  if (typeof message !== 'string' || message.length === 0) throw new Error('commit message required');
  if (message.length > 10_000) throw new Error('commit message too long');
  const args = ['commit'];
  if (allFiles) args.push('-a');
  args.push('-m', message);
  return args;
};

module.exports.validateCwd = function validateCwd(cwd, dataDir) {
  if (typeof cwd !== 'string' || cwd.includes('..')) throw new Error('invalid cwd');
  if (!cwd.startsWith(dataDir)) throw new Error('cwd outside dataDir');
  return cwd;
};
```

- [ ] **Step 2: Failing tests**

`plugins/git-backup/__tests__/safe-args.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { buildCommitArgs, validateCwd } = require('../safe-args.js');

describe('buildCommitArgs', () => {
  it('quotes adversarial commit messages safely as a single argv entry', () => {
    const args = buildCommitArgs({ message: "'; rm -rf /; #" });
    expect(args).toEqual(['commit', '-a', '-m', "'; rm -rf /; #"]);
  });
  it('rejects empty messages', () => {
    expect(() => buildCommitArgs({ message: '' })).toThrow();
  });
});
describe('validateCwd', () => {
  it('rejects path traversal', () => {
    expect(() => validateCwd('/data/notes/../etc', '/data')).toThrow();
  });
  it('accepts paths inside dataDir', () => {
    expect(validateCwd('/data/notes', '/data')).toBe('/data/notes');
  });
});
```

- [ ] **Step 3: Replace `exec` with `execFile`**

In `plugins/git-backup/server/index.js`:
```js
const { execFile } = require('child_process');
const { promisify } = require('util');
const pExecFile = promisify(execFile);
const { buildCommitArgs, validateCwd } = require('../safe-args.js');

async function gitCommit(cwd, message) {
  validateCwd(cwd, dataDir); // dataDir comes from plugin activate scope
  const args = buildCommitArgs({ message });
  return pExecFile('git', args, { cwd, timeout: 30_000 });
}

async function gitAdd(cwd) {
  validateCwd(cwd, dataDir);
  return pExecFile('git', ['add', '-A'], { cwd, timeout: 30_000 });
}

async function gitStatus(cwd) {
  validateCwd(cwd, dataDir);
  return pExecFile('git', ['status', '--porcelain'], { cwd, timeout: 10_000 });
}

async function gitLog(cwd, limit = 20) {
  validateCwd(cwd, dataDir);
  const max = Math.min(Math.max(1, parseInt(limit, 10) || 20), 200);
  return pExecFile('git', ['log', `--max-count=${max}`, '--pretty=format:%H|%aI|%s'], { cwd, timeout: 10_000 });
}

async function gitPush(cwd) {
  validateCwd(cwd, dataDir);
  return pExecFile('git', ['push'], { cwd, timeout: 60_000 });
}
```

Add on activate:
```js
try { await pExecFile('git', ['--version']); }
catch { console.warn('[git-backup] git binary not found; plugin disabled'); return; }
```

- [ ] **Step 4: Verify**

```bash
npm run lint && npm run test
```

- [ ] **Step 5: Commit**

```bash
git add plugins/git-backup
git commit -m "fix(git-backup): use execFile and validate cwd to prevent shell injection"
```

## Task 1.C — templater picker + variable prompts (fixes agent)

**Files:**
- Modify: `plugins/templater/client/index.js`
- Modify: `plugins/templater/server/index.js`
- Create: `plugins/templater/__tests__/date-format.test.js`
- Create: `plugins/templater/__tests__/prompt-vars.test.js`
- Create: `plugins/templater/template-engine.js`

- [ ] **Step 1: Extract engine**

`plugins/templater/template-engine.js`:
```js
function applyDateFormat(date, fmt) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return fmt
    .replace(/YYYY/g, date.getFullYear())
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
}

function extractPrompts(template) {
  const re = /\{\{prompt:([a-zA-Z0-9_]+)\}\}/g;
  const set = new Set();
  for (const m of template.matchAll(re)) set.add(m[1]);
  return [...set];
}

function processTemplate(template, { now = new Date(), vars = {}, prompts = {} } = {}) {
  return template
    .replace(/\{\{date(?::([^}]+))?\}\}/g, (_, fmt) => applyDateFormat(now, fmt || 'YYYY-MM-DD'))
    .replace(/\{\{time\}\}/g, applyDateFormat(now, 'HH:mm:ss'))
    .replace(/\{\{now\}\}/g, now.toISOString())
    .replace(/\{\{random\}\}/g, Math.random().toString(36).slice(2, 10))
    .replace(/\{\{prompt:([a-zA-Z0-9_]+)\}\}/g, (_, name) => prompts[name] ?? '')
    .replace(/\{\{(\w+)\}\}/g, (m, name) => vars[name] ?? m);
}

module.exports = { applyDateFormat, extractPrompts, processTemplate };
```

- [ ] **Step 2: Tests**

`plugins/templater/__tests__/date-format.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { applyDateFormat, processTemplate } = require('../template-engine.js');

describe('applyDateFormat', () => {
  const d = new Date('2026-05-19T14:23:09Z');
  it('formats YYYY-MM-DD', () => {
    expect(applyDateFormat(new Date(2026, 4, 19), 'YYYY-MM-DD')).toBe('2026-05-19');
  });
  it('formats HH:mm:ss', () => {
    expect(applyDateFormat(new Date(2026, 4, 19, 14, 5, 9), 'HH:mm:ss')).toBe('14:05:09');
  });
});

describe('processTemplate', () => {
  it('substitutes date and prompt vars', () => {
    const out = processTemplate('Title: {{prompt:Title}}\nDate: {{date}}',
      { now: new Date(2026, 4, 19), prompts: { Title: 'Hello' } });
    expect(out).toContain('Title: Hello');
    expect(out).toContain('Date: 2026-05-19');
  });
  it('leaves unknown vars intact', () => {
    expect(processTemplate('{{unknown}}', {})).toBe('{{unknown}}');
  });
});
```

`plugins/templater/__tests__/prompt-vars.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { extractPrompts } = require('../template-engine.js');

describe('extractPrompts', () => {
  it('returns unique prompt names in order of first appearance', () => {
    expect(extractPrompts('{{prompt:A}} {{prompt:B}} {{prompt:A}}')).toEqual(['A', 'B']);
  });
  it('empty for no prompts', () => {
    expect(extractPrompts('plain {{date}}')).toEqual([]);
  });
});
```

Run: `npx vitest run plugins/templater` — expect PASS.

- [ ] **Step 3: Server uses the engine**

In `plugins/templater/server/index.js` replace inline regex with `require('../template-engine.js').processTemplate`. Accept `{ prompts }` in the POST `/process` body.

- [ ] **Step 4: Client picker modal**

Replace `templates[0]` hardcode in `plugins/templater/client/index.js`:
```js
async function openTemplatePicker(notePath) {
  const res = await api.api.fetch('/templates');
  const list = (await res.json()).templates || [];
  if (!list.length) { api.notify.info('No templates found'); return; }

  const choice = await pickFromList(list.map(t => ({ label: t.name, value: t })));
  if (!choice) return;

  const contentRes = await api.api.fetch(`/template/${encodeURIComponent(choice.path)}`);
  const tmpl = (await contentRes.json()).content;

  // Prompt for any {{prompt:Name}} vars
  const promptNames = /* call /extract-prompts or compute client-side */;
  const promptValues = await collectPromptValues(promptNames);

  const processed = await api.api.fetch('/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: tmpl, prompts: promptValues, vars: { title: basename(notePath) } })
  }).then(r => r.json());

  await api.notes.update(notePath, processed.content);
  api.notify.success(`Applied template: ${choice.label}`);
}
```

`pickFromList` and `collectPromptValues` are small modal helpers using the React from `__krytonPluginDeps`; implement as named exports from `plugins/templater/client/modal.js`.

- [ ] **Step 5: Verify & commit**

```bash
npm run lint && npm run test
git add plugins/templater
git commit -m "feat(templater): picker modal + {{prompt:}} variable collection + tests"
```

## Task 1.D — RSS parser swap + scheduler (rss agent)

**Files:**
- Modify: `plugins/rss-reader/server/index.js`
- Create: `plugins/rss-reader/parser.js`
- Create: `plugins/rss-reader/__tests__/parser.test.js`

- [ ] **Step 1: Parser module using fast-xml-parser via dynamic import**

`plugins/rss-reader/parser.js`:
```js
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  cdataPropName: '__cdata',
  trimValues: true,
});

function normalizeItems(items, kind) {
  return items.map((it) => {
    if (kind === 'atom') {
      return {
        guid: it.id || it.link?.['@href'] || it.title,
        title: stripCdata(it.title) || '',
        link: typeof it.link === 'string' ? it.link : (it.link?.['@href'] || ''),
        description: stripCdata(it.summary || it.content) || '',
        pubDate: it.updated || it.published || null,
      };
    }
    return {
      guid: it.guid?.['#text'] || it.guid || it.link || it.title,
      title: stripCdata(it.title) || '',
      link: it.link || '',
      description: stripCdata(it.description) || '',
      pubDate: it.pubDate || null,
    };
  });
}
function stripCdata(v) { if (v && typeof v === 'object' && v.__cdata) return v.__cdata; return v; }

function parseFeed(xml) {
  const doc = parser.parse(xml);
  if (doc.rss?.channel) {
    const ch = doc.rss.channel;
    const items = Array.isArray(ch.item) ? ch.item : (ch.item ? [ch.item] : []);
    return { title: stripCdata(ch.title) || 'Untitled', items: normalizeItems(items, 'rss') };
  }
  if (doc.feed) {
    const items = Array.isArray(doc.feed.entry) ? doc.feed.entry : (doc.feed.entry ? [doc.feed.entry] : []);
    return { title: stripCdata(doc.feed.title) || 'Untitled', items: normalizeItems(items, 'atom') };
  }
  throw new Error('Unrecognized feed format');
}
module.exports = { parseFeed };
```

Add `"fast-xml-parser": "^4.4.1"` to **`plugins/rss-reader/package.json`** if plugins support per-plugin deps; otherwise vendor it (check `scripts/build-plugins.js`). If server runs in host Node, declare as a host-side dep instead — surface to user if neither path is wired and adjust.

- [ ] **Step 2: Tests**

`plugins/rss-reader/__tests__/parser.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { parseFeed } = require('../parser.js');

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title><![CDATA[Demo Feed]]></title>
  <item><title>One</title><link>http://x/1</link><guid>1</guid><pubDate>Mon, 19 May 2026 00:00:00 GMT</pubDate><description><![CDATA[<p>hi</p>]]></description></item>
  <item><title>Two</title><link>http://x/2</link><guid>2</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Demo</title>
  <entry><id>a1</id><title>A</title><link href="http://x/a"/><updated>2026-05-19T00:00:00Z</updated><summary>sum</summary></entry>
</feed>`;

describe('parseFeed', () => {
  it('parses RSS 2.0 with CDATA', () => {
    const f = parseFeed(RSS);
    expect(f.title).toBe('Demo Feed');
    expect(f.items).toHaveLength(2);
    expect(f.items[0].description).toContain('<p>hi</p>');
  });
  it('parses Atom feeds', () => {
    const f = parseFeed(ATOM);
    expect(f.title).toBe('Atom Demo');
    expect(f.items[0].link).toBe('http://x/a');
  });
  it('throws on garbage', () => {
    expect(() => parseFeed('<html/>')).toThrow();
  });
});
```

- [ ] **Step 3: Wire parser into server**

In `plugins/rss-reader/server/index.js`, replace the regex extraction inside the `/feeds/:id/items` handler with `const feed = parseFeed(xmlText); return feed.items.slice(0, 50);`.

- [ ] **Step 4: Scheduler**

In the same file, on activate:
```js
const settings = api.settings.get();
const intervalMin = Number(settings.refreshIntervalMinutes ?? 30);
let timer = null;
function startScheduler() {
  if (timer) clearInterval(timer);
  if (!intervalMin) return;
  timer = setInterval(async () => {
    const subs = await store.listFeeds();
    for (const s of subs) {
      try {
        const xml = await fetchFeedXml(s.url);
        const { items } = parseFeed(xml);
        const newGuids = items.map(i => i.guid).filter(g => !s.seenGuids.includes(g));
        if (newGuids.length) {
          await store.recordSeen(s.id, items.map(i => i.guid));
          await store.bumpUnread(s.id, newGuids.length);
        }
      } catch (e) { console.warn('[rss-reader] poll failed for', s.url, e.message); }
    }
  }, intervalMin * 60_000);
}
startScheduler();
```
Add `deactivate` to `clearInterval(timer)`.

Add unread badge to client sidebar (small numeric next to feed name from `s.unread`).

- [ ] **Step 5: Verify & commit**

```bash
npm run lint && npm run test
git add plugins/rss-reader
git commit -m "feat(rss-reader): fast-xml-parser, scheduled polling, unread badge + tests"
```

## Task 1.E — Flashcards SRS (expansions agent)

**Files:**
- Create: `plugins/flashcards/srs.js`
- Create: `plugins/flashcards/__tests__/srs.test.js`
- Modify: `plugins/flashcards/client/index.js`
- Modify: `plugins/flashcards/server/index.js`

- [ ] **Step 1: SM-2 module**

`plugins/flashcards/srs.js`:
```js
// SM-2 algorithm: ratings 0..3 → Again/Hard/Good/Easy (mapped to quality 1,3,4,5)
function nextReview(card, rating) {
  const quality = [1, 3, 4, 5][rating];
  let { repetitions = 0, easeFactor = 2.5, intervalDays = 0 } = card;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  }
  const dueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
  return { repetitions, easeFactor: Number(easeFactor.toFixed(2)), intervalDays, dueAt };
}

function hashCard(question, answer) {
  // simple FNV-1a — stable across processes; not crypto
  let h = 0x811c9dc5;
  for (const c of question + '||' + answer) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

module.exports = { nextReview, hashCard };
```

- [ ] **Step 2: Tests**

`plugins/flashcards/__tests__/srs.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { nextReview, hashCard } = require('../srs.js');

describe('nextReview SM-2', () => {
  it('first Good review → interval 1', () => {
    const r = nextReview({ repetitions: 0, easeFactor: 2.5, intervalDays: 0 }, 2);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
  });
  it('second Good review → interval 6', () => {
    const r = nextReview({ repetitions: 1, easeFactor: 2.5, intervalDays: 1 }, 2);
    expect(r.intervalDays).toBe(6);
  });
  it('Again resets repetitions', () => {
    const r = nextReview({ repetitions: 5, easeFactor: 2.5, intervalDays: 30 }, 0);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(1);
  });
  it('ease factor floor at 1.3', () => {
    let card = { repetitions: 0, easeFactor: 1.3, intervalDays: 0 };
    for (let i = 0; i < 10; i++) card = nextReview(card, 1);
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});
describe('hashCard', () => {
  it('is stable', () => {
    expect(hashCard('q', 'a')).toBe(hashCard('q', 'a'));
  });
  it('differs across content', () => {
    expect(hashCard('q1', 'a')).not.toBe(hashCard('q2', 'a'));
  });
});
```

- [ ] **Step 3: Wire into client**

In `plugins/flashcards/client/index.js`:
- After parsing cards, load `reviews = await api.storage.get('reviews', {})`.
- Sort due cards first: `cards.sort((a, b) => dueDate(reviews[hash(a)]) - dueDate(reviews[hash(b)]))`.
- Below the answer, render 4 buttons (Again/Hard/Good/Easy) that call `nextReview` and persist:
```js
const newState = nextReview(reviews[h] || {}, rating);
reviews[h] = newState;
await api.storage.set('reviews', reviews);
```

- [ ] **Step 4: Verify & commit**

```bash
npm run lint && npm run test
git add plugins/flashcards
git commit -m "feat(flashcards): SM-2 SRS + per-card review persistence + tests"
```

## Task 1.F — Theme presets + dark mode (expansions agent)

**Files:**
- Create: `plugins/theme-settings/presets.js`
- Create: `plugins/theme-settings/__tests__/presets.test.js`
- Modify: `plugins/theme-settings/client/index.js`

- [ ] **Step 1: Presets data + apply fn**

`plugins/theme-settings/presets.js`:
```js
const PRESETS = {
  default:          { name: 'Default',          accent: '#8b5cf6', fontFamily: 'system-ui', fontSize: 16, lineHeight: 1.6, contentMaxWidth: 800, mode: 'system' },
  'solarized-light':{ name: 'Solarized Light',  accent: '#268bd2', fontFamily: 'Menlo, monospace', fontSize: 15, lineHeight: 1.7, contentMaxWidth: 720, mode: 'light' },
  'solarized-dark': { name: 'Solarized Dark',   accent: '#b58900', fontFamily: 'Menlo, monospace', fontSize: 15, lineHeight: 1.7, contentMaxWidth: 720, mode: 'dark' },
  nord:             { name: 'Nord',             accent: '#88c0d0', fontFamily: 'Inter, sans-serif', fontSize: 16, lineHeight: 1.6, contentMaxWidth: 800, mode: 'dark' },
  dracula:          { name: 'Dracula',          accent: '#bd93f9', fontFamily: 'Fira Code, monospace', fontSize: 15, lineHeight: 1.6, contentMaxWidth: 800, mode: 'dark' },
};

function buildStyles({ accent, fontFamily, fontSize, lineHeight, contentMaxWidth, mode }) {
  return `
:root { --accent: ${accent}; --base-font-size: ${fontSize}px; --line-height: ${lineHeight}; --content-max-width: ${contentMaxWidth}px; }
:root[data-theme="dark"] { color-scheme: dark; }
:root[data-theme="light"] { color-scheme: light; }
body, .cm-editor, .markdown-preview { font-family: ${fontFamily}; }
`.trim();
}

function resolveMode(mode) {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }
  return mode;
}

module.exports = { PRESETS, buildStyles, resolveMode };
```

- [ ] **Step 2: Tests**

`plugins/theme-settings/__tests__/presets.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { PRESETS, buildStyles, resolveMode } = require('../presets.js');

describe('presets', () => {
  it('every preset has required fields', () => {
    for (const p of Object.values(PRESETS)) {
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof p.fontSize).toBe('number');
      expect(['light', 'dark', 'system']).toContain(p.mode);
    }
  });
  it('buildStyles embeds accent', () => {
    expect(buildStyles(PRESETS.dracula)).toContain('#bd93f9');
  });
  it('resolveMode passes through light/dark', () => {
    expect(resolveMode('dark')).toBe('dark');
    expect(resolveMode('light')).toBe('light');
  });
});
```

- [ ] **Step 3: Wire into client**

In `plugins/theme-settings/client/index.js`:
- Add preset dropdown to settings UI; on select, write all preset fields to plugin settings (user can still tweak after).
- Add explicit Light/Dark/System radio.
- In `ThemeApplier`, call `document.documentElement.setAttribute('data-theme', resolveMode(mode))` and inject `buildStyles({...})`.
- Listen for `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', …)` to re-apply when mode is `system`.

- [ ] **Step 4: Verify & commit**

```bash
npm run lint && npm run test
git add plugins/theme-settings
git commit -m "feat(theme-settings): named presets + explicit dark mode toggle + tests"
```

---

# Phase 2 — Real interactive plugins (parallel)

## Task 2.A — Real Kanban (kanban agent)

**Files:**
- Modify: `plugins/kanban/client/index.js`
- Create: `plugins/kanban/board-model.js`
- Create: `plugins/kanban/__tests__/board-model.test.js`

- [ ] **Step 1: Board model with round-trip**

`plugins/kanban/board-model.js`:
```js
// markdown ⇄ board model. Round-trip is identity for normalized input.
function parseBoard(md) {
  const lines = md.split('\n');
  const columns = [];
  let cur = null;
  for (const raw of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h) { cur = { title: h[1], cards: [] }; columns.push(cur); continue; }
    const c = /^\s*-\s+(?:\[(?<box>[ xX])\]\s+)?(?:\[#(?<id>[a-z0-9]+)\]\s+)?(?<text>.+?)\s*$/.exec(raw);
    if (c && cur) cur.cards.push({ id: c.groups.id || null, text: c.groups.text, done: c.groups.box?.toLowerCase() === 'x' });
  }
  return { columns };
}

function serializeBoard(board) {
  const out = [];
  for (const col of board.columns) {
    out.push(`## ${col.title}`);
    for (const card of col.cards) {
      const box = card.done ? '[x] ' : '';
      const id = card.id ? `[#${card.id}] ` : '';
      out.push(`- ${box}${id}${card.text}`);
    }
  }
  return out.join('\n');
}

let _idCounter = 0;
function genId() { _idCounter++; return Date.now().toString(36) + _idCounter.toString(36); }

module.exports = { parseBoard, serializeBoard, genId };
```

- [ ] **Step 2: Tests**

`plugins/kanban/__tests__/board-model.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { parseBoard, serializeBoard } = require('../board-model.js');

const SAMPLE = `## Todo
- Buy milk
- [#abc] Write spec
## Done
- [x] Old item`;

describe('board model', () => {
  it('parses columns and cards', () => {
    const b = parseBoard(SAMPLE);
    expect(b.columns.map(c => c.title)).toEqual(['Todo', 'Done']);
    expect(b.columns[0].cards[1]).toMatchObject({ id: 'abc', text: 'Write spec', done: false });
    expect(b.columns[1].cards[0]).toMatchObject({ done: true });
  });
  it('round-trips identity for normalized input', () => {
    expect(serializeBoard(parseBoard(SAMPLE))).toBe(SAMPLE);
  });
  it('serializes a board with no cards in a column', () => {
    expect(serializeBoard({ columns: [{ title: 'Empty', cards: [] }] })).toBe('## Empty');
  });
});
```

- [ ] **Step 3: Interactive client**

Rewrite `plugins/kanban/client/index.js`:

```js
const { React } = window.__krytonPluginDeps;
const { parseBoard, serializeBoard, genId } = require('../board-model.js'); // bundled by build-plugins
let Sortable;

async function loadSortable() {
  if (Sortable) return Sortable;
  const mod = await import('https://esm.sh/sortablejs@1.15.2');
  Sortable = mod.default;
  return Sortable;
}

function KanbanBoard({ source, onChange }) {
  const [board, setBoard] = React.useState(() => parseBoard(source));
  const containerRef = React.useRef(null);
  const debounceRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    let sortables = [];
    loadSortable().then((SortableLib) => {
      const cols = containerRef.current.querySelectorAll('[data-column-idx]');
      cols.forEach((el) => {
        sortables.push(new SortableLib(el, {
          group: 'kanban-cards',
          animation: 150,
          onEnd: (evt) => {
            const next = structuredClone(board);
            const from = Number(evt.from.dataset.columnIdx);
            const to = Number(evt.to.dataset.columnIdx);
            const [card] = next.columns[from].cards.splice(evt.oldIndex, 1);
            next.columns[to].cards.splice(evt.newIndex, 0, card);
            commit(next);
          },
        }));
      });
    });
    return () => sortables.forEach(s => s.destroy());
  }, [board.columns.length]);

  function commit(next) {
    setBoard(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(serializeBoard(next)), 300);
  }

  function addCard(colIdx) {
    const next = structuredClone(board);
    next.columns[colIdx].cards.push({ id: genId(), text: 'New card', done: false });
    commit(next);
  }
  function addColumn() {
    commit({ ...board, columns: [...board.columns, { title: 'New Column', cards: [] }] });
  }
  function deleteCard(colIdx, cardIdx) {
    const next = structuredClone(board);
    next.columns[colIdx].cards.splice(cardIdx, 1);
    commit(next);
  }
  function editCardText(colIdx, cardIdx, text) {
    const next = structuredClone(board);
    next.columns[colIdx].cards[cardIdx].text = text;
    if (!next.columns[colIdx].cards[cardIdx].id) next.columns[colIdx].cards[cardIdx].id = genId();
    commit(next);
  }

  return React.createElement('div', { className: 'kanban-board', ref: containerRef, style: { display: 'flex', gap: 12, overflowX: 'auto' } },
    board.columns.map((col, ci) =>
      React.createElement('div', { key: ci, className: 'kanban-col', style: { minWidth: 240, background: 'var(--bg-2, #f4f4f4)', padding: 8, borderRadius: 6 } },
        React.createElement('h3', null, col.title),
        React.createElement('div', { 'data-column-idx': ci, style: { minHeight: 40 } },
          col.cards.map((card, idx) =>
            React.createElement('div', { key: card.id || idx, className: 'kanban-card', style: { background: '#fff', padding: 6, marginBottom: 6, borderRadius: 4, cursor: 'grab' } },
              React.createElement('input', {
                value: card.text,
                onChange: (e) => editCardText(ci, idx, e.target.value),
                style: { width: '100%', border: 'none', background: 'transparent' }
              }),
              React.createElement('button', { onClick: () => deleteCard(ci, idx), style: { float: 'right', fontSize: 11 } }, '×')
            )
          )
        ),
        React.createElement('button', { onClick: () => addCard(ci), style: { marginTop: 8, width: '100%' } }, '+ Add card')
      )
    ).concat(
      React.createElement('button', { key: 'add-col', onClick: addColumn, style: { minWidth: 120 } }, '+ Add column')
    )
  );
}

module.exports.activate = (api) => {
  api.markdown.registerCodeFenceRenderer('kanban', ({ source, range, notePath }) => {
    return React.createElement(KanbanBoard, {
      source,
      onChange: (next) => api.notes.replaceFenceAtRange(notePath, range, '```kanban\n' + next + '\n```').catch(e => api.notify.error('Kanban save failed: ' + e.message)),
    });
  });
};
module.exports.deactivate = () => {};
```

> If `registerCodeFenceRenderer` does not currently pass `{ range, notePath }` to renderers, the **infra agent** must extend the host renderer to do so before this task lands; surface that gap.

- [ ] **Step 4: Verify**

```bash
npm run lint && npm run test
```
Manually: open a note containing a ```kanban fence; drag cards; reopen note; verify markdown matches.

- [ ] **Step 5: Commit**

```bash
git add plugins/kanban
git commit -m "feat(kanban): real interactive board with drag/drop + fence round-trip + tests"
```

## Task 2.B — Real Excalidraw (excalidraw agent)

**Files:**
- Modify: `plugins/excalidraw/client/index.js`
- Create: `plugins/excalidraw/scene-parser.js`
- Create: `plugins/excalidraw/__tests__/scene-parser.test.js`

- [ ] **Step 1: Scene parser/serializer**

`plugins/excalidraw/scene-parser.js`:
```js
function parseScene(source) {
  if (!source || !source.trim()) return { elements: [], appState: {} };
  try { return JSON.parse(source); } catch { return null; }
}
function serializeScene(scene) {
  return JSON.stringify({ type: 'excalidraw', version: 2, source: 'kryton', ...scene }, null, 2);
}
function buildFenceBlock(scene, svg) {
  return '```excalidraw\n' + serializeScene(scene) + '\n```\n```excalidraw-preview\n' + svg.trim() + '\n```';
}
module.exports = { parseScene, serializeScene, buildFenceBlock };
```

- [ ] **Step 2: Tests**

`plugins/excalidraw/__tests__/scene-parser.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { parseScene, serializeScene, buildFenceBlock } = require('../scene-parser.js');

describe('scene parser', () => {
  it('returns empty scene for blank input', () => {
    expect(parseScene('')).toEqual({ elements: [], appState: {} });
  });
  it('returns null for malformed JSON (caller renders error)', () => {
    expect(parseScene('{not json')).toBe(null);
  });
  it('round-trips a scene', () => {
    const scene = { elements: [{ id: '1', type: 'rectangle' }], appState: { viewBackgroundColor: '#fff' } };
    const round = parseScene(serializeScene(scene));
    expect(round.elements).toEqual(scene.elements);
  });
  it('buildFenceBlock includes both source and preview', () => {
    const block = buildFenceBlock({ elements: [] }, '<svg></svg>');
    expect(block).toContain('```excalidraw\n');
    expect(block).toContain('```excalidraw-preview\n<svg></svg>');
  });
});
```

- [ ] **Step 3: Client renderer**

Rewrite `plugins/excalidraw/client/index.js`:

```js
const { React } = window.__krytonPluginDeps;
const { parseScene, buildFenceBlock } = require('../scene-parser.js');

let ExcalidrawLib = null;
async function loadExcalidraw() {
  if (ExcalidrawLib) return ExcalidrawLib;
  const mod = await import('https://esm.sh/@excalidraw/excalidraw@0.17.6?bundle&deps=react@18.2.0,react-dom@18.2.0');
  ExcalidrawLib = mod;
  return ExcalidrawLib;
}

function ExcalidrawPreview({ source, onOpen }) {
  const scene = parseScene(source);
  if (scene === null) {
    return React.createElement('div', { style: { color: 'crimson', padding: 8 } }, 'Excalidraw: malformed JSON');
  }
  const count = scene.elements?.length || 0;
  return React.createElement('div', { style: { border: '1px solid #ddd', padding: 12, borderRadius: 6 } },
    React.createElement('div', null, `Excalidraw scene — ${count} element(s)`),
    React.createElement('button', { onClick: onOpen, style: { marginTop: 8 } }, 'Open editor')
  );
}

function EditorModal({ source, onSave, onClose }) {
  const [Lib, setLib] = React.useState(null);
  const sceneRef = React.useRef(parseScene(source) || { elements: [], appState: {} });
  React.useEffect(() => { loadExcalidraw().then(setLib).catch(e => { console.error(e); onClose(); }); }, []);
  if (!Lib) return React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' } }, 'Loading Excalidraw…');

  return React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'white', zIndex: 9999, display: 'flex', flexDirection: 'column' } },
    React.createElement('div', { style: { padding: 8, borderBottom: '1px solid #ddd' } },
      React.createElement('button', { onClick: async () => {
        const elements = sceneRef.current.elements;
        const appState = sceneRef.current.appState;
        const svg = await Lib.exportToSvg({ elements, appState, files: null });
        onSave({ elements, appState }, svg.outerHTML);
      } }, 'Save'),
      React.createElement('button', { onClick: onClose, style: { marginLeft: 8 } }, 'Cancel')
    ),
    React.createElement('div', { style: { flex: 1 } },
      React.createElement(Lib.Excalidraw, {
        initialData: sceneRef.current,
        onChange: (elements, appState) => { sceneRef.current = { elements, appState }; }
      })
    )
  );
}

module.exports.activate = (api) => {
  api.markdown.registerCodeFenceRenderer('excalidraw', ({ source, range, notePath }) => {
    const [open, setOpen] = React.useState(false);
    const handleSave = async (scene, svg) => {
      const block = buildFenceBlock(scene, svg);
      await api.notes.replaceFenceAtRange(notePath, range, block);
      setOpen(false);
    };
    return React.createElement(React.Fragment, null,
      React.createElement(ExcalidrawPreview, { source, onOpen: () => setOpen(true) }),
      open && React.createElement(EditorModal, { source, onSave: handleSave, onClose: () => setOpen(false) })
    );
  });
  // Hide the auto-generated preview fence from regular renderers
  api.markdown.registerCodeFenceRenderer('excalidraw-preview', ({ source }) =>
    React.createElement('div', { dangerouslySetInnerHTML: { __html: source } })
  );
};
module.exports.deactivate = () => {};
```

- [ ] **Step 4: Verify**

```bash
npm run lint && npm run test
```
Manually: insert ```excalidraw\n``` fence; click "Open editor"; draw a rectangle; Save; verify both `excalidraw` and `excalidraw-preview` fences appear in note; close & reopen note; preview renders without loading the heavy lib.

- [ ] **Step 5: Commit**

```bash
git add plugins/excalidraw
git commit -m "feat(excalidraw): real editor via @excalidraw/excalidraw + SVG preview cache + tests"
```

## Task 2.C — vim-mode rewire (vim agent)

**Files:**
- Modify: `plugins/vim-mode/client/index.js`

- [ ] **Step 1: Replace activate()**

```js
const { React, vim, Vim, getCM } = window.__krytonPluginDeps;

module.exports.activate = (api) => {
  let cm = null;
  let modeListeners = new Set();
  let currentMode = 'normal';

  function broadcast(mode) {
    currentMode = mode;
    modeListeners.forEach(fn => fn(mode));
  }

  api.editor.registerExtension(vim());

  // Hook into Vim mode-change events via the CodeMirror compat layer.
  // The host editor must expose the CM6 view; getCM(view) returns a compat object.
  const tryHook = () => {
    const view = api.editor.getCurrentView?.();
    if (!view) return false;
    const cmCompat = getCM(view);
    if (!cmCompat) return false;
    cm = cmCompat;
    cm.on('vim-mode-change', (e) => broadcast(e.mode));
    return true;
  };
  // Try immediately then on each focus
  if (!tryHook()) {
    const off = api.editor.onFocus?.(() => { if (!cm) tryHook(); });
    api.deactivate = () => off?.();
  }

  function ModeIndicator() {
    const [m, setM] = React.useState(currentMode);
    React.useEffect(() => { modeListeners.add(setM); return () => modeListeners.delete(setM); }, []);
    return React.createElement('span', null, `-- ${m.toUpperCase()} --`);
  }

  api.ui.registerStatusBarItem(ModeIndicator, { id: 'vim-mode-indicator', position: 'left' });

  // Persistent on/off toggle via api.storage (no /toggle endpoint)
  api.commands.register({
    id: 'vim:toggle', name: 'Toggle Vim mode',
    execute: async () => {
      const enabled = (await api.storage.get('enabled', true)) === true;
      await api.storage.set('enabled', !enabled);
      api.notify.info(`Vim mode ${enabled ? 'disabled' : 'enabled'} — reload to apply`);
    },
  });
};

module.exports.deactivate = () => { /* extension lifetime managed by editor */ };
```

> If `api.editor.getCurrentView` / `onFocus` / `api.storage` do not exist, surface to user; do not invent. They are part of the documented API per the spec.

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run test
```
Manually (after infra Task 0.3 deployed): boot the desktop app, open a note, verify `i` enters Insert and Esc returns to Normal; status bar updates without 200ms polling.

- [ ] **Step 3: Commit**

```bash
git add plugins/vim-mode
git commit -m "fix(vim-mode): use injected vim deps, drop dead /toggle, event-driven mode indicator"
```

---

# Phase 3 — Docs & verify

## Task 3.A — Documentation (docs agent)

**Files:**
- Modify: `kryton-plugins/README.md`
- Modify: `kryton-plugins/docs/PLUGIN_API.md`
- Modify: `kryton-plugins/docs/CONTRIBUTING.md`

- [ ] **Step 1: README plugin table**

Replace the small 2-row table in `README.md` with all 25 plugins (one line each, accurate descriptions matching their `manifest.json`).

- [ ] **Step 2: PLUGIN_API additions**

In `docs/PLUGIN_API.md`, add sections for:
- `api.notes.openByPath(path)`
- `api.notes.getContent(path)`
- `api.notes.update(path, content)`
- `api.notes.replaceFenceAtRange(path, range, newSource)` with an example
- `api.markdown.registerCodeFenceRenderer` — document that the render fn receives `{ source, range, notePath }` (range is `{ startLine, endLine }`)
- `api.storage.get/set` (per-plugin scoped)
- Updated `__krytonPluginDeps` exports: `React`, `ReactDOM`, `vim`, `Vim`, `getCM`

- [ ] **Step 3: CONTRIBUTING test instructions**

Add to `docs/CONTRIBUTING.md`:
```
## Testing
Plugins use Vitest. Place tests under `plugins/<name>/__tests__/*.test.js`.
Run:
  npm test              # syntax + vitest
  npm run test:unit     # vitest only
  npm run test:watch    # vitest watch mode
Aim for ≥80% coverage on pure modules (parsers, validators, serializers).
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/PLUGIN_API.md docs/CONTRIBUTING.md
git commit -m "docs: full plugins table; document new APIs and vitest workflow"
```

## Task 3.B — Final verification (verify agent, main thread)

- [ ] **Step 1: Lint, typecheck, test**

```bash
cd kryton-plugins
npm run lint        # 0 warnings
npm run typecheck   # green
npm run test        # syntax + vitest both green
```

- [ ] **Step 2: Registry regeneration**

```bash
npm run generate    # rebuilds registry.json from manifests
```

- [ ] **Step 3: Coverage gate**

```bash
npm run test:unit -- --coverage
```
Expected: ≥80% line coverage on:
- `plugins/checklist/parser.js`
- `plugins/git-backup/safe-args.js`
- `plugins/templater/template-engine.js`
- `plugins/rss-reader/parser.js`
- `plugins/flashcards/srs.js`
- `plugins/theme-settings/presets.js`
- `plugins/kanban/board-model.js`
- `plugins/excalidraw/scene-parser.js`

- [ ] **Step 4: Manual smoke checklist**

Boot `kryton-desktop` (or web dev server). For each of these 25 plugins, activate and exercise the primary feature; record pass/fail:

| Plugin | Action | Expected |
|---|---|---|
| advanced-tables | Ctrl+Shift+T on a table | columns aligned |
| calendar | open sidebar, click date | daily note opens |
| calendar-journal | open sidebar | entries listed |
| checklist | open sidebar, click an item | navigates to note line |
| dataview | insert `\`\`\`dataview FROM #tag` | results render |
| excalidraw | insert `\`\`\`excalidraw`, edit, save | scene + preview persist |
| flashcards | open Q/A note → flashcards modal | SRS buttons present |
| git-backup | commit with `'; rm -rf /;` message | literal string in git log, no exec |
| kanban | insert `\`\`\`kanban`, drag card | markdown updates |
| mass-upload | upload 5 .md files | confirm flow works |
| mermaid-diagrams | insert mermaid fence | renders |
| metrics | open sidebar | stats render |
| mind-map | open mind-map of a note | interactive |
| pomodoro | click status bar | timer ticks |
| presentation | run "Present" | slides navigate |
| publish | "Export as HTML" | file downloads |
| reading-list | add URL | persists |
| recent-files | open notes | list updates |
| rss-reader | add feed | items fetch + scheduler ticks after 30 min (or set interval=1 for test) |
| sample-wordcount | call endpoint | returns count |
| slash-commands | type `/` in editor | menu appears |
| tag-wrangler | rename a tag | all notes updated |
| templater | apply template with `{{prompt:X}}` | modal prompts X |
| theme-settings | switch preset to Dracula | theme applied |
| vim-mode | press `i` | enters insert mode, status updates |

- [ ] **Step 5: Final commit**

```bash
git add registry.json
git commit -m "chore: regenerate registry.json"
```

---

## Self-review (already applied)

- Spec coverage: every spec section has at least one task (checked).
- Placeholder scan: no TBD/TODO; ambiguities re. host API shape are surfaced explicitly with "surface to user" callouts in Tasks 0.2, 2.A, 2.C.
- Type consistency: `parseBoard`/`serializeBoard`, `parseScene`/`serializeScene`/`buildFenceBlock`, `nextReview`/`hashCard`, `PRESETS`/`buildStyles`/`resolveMode` are referenced with identical names everywhere.
