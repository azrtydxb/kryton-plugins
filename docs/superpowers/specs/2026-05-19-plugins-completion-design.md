# Plugins Completion — Design Spec

**Date:** 2026-05-19
**Status:** Approved
**Scope:** Close every gap in the kryton-plugins registry, ship real interactive Kanban and Excalidraw, expand four plugins, introduce a real test framework.

## Background

Audit on 2026-05-19 (see conversation log) found:
- 17 plugins working, 2 partial (checklist, templater), 2 placeholders (excalidraw, kanban), 1 broken (vim-mode), 1 sample (sample-wordcount), git-backup carrying a shell-injection risk.
- Repo "test" suite (`scripts/test-plugins.js`) only checks parse + export shape. **Zero functional tests anywhere.**

This spec brings every plugin to a production-ready state and introduces a real test framework.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| 3rd-party lib loading | CDN at runtime (esm.sh) | Matches existing mermaid/markmap pattern; zero build churn |
| Kanban / Excalidraw persistence | Rewrite source code fence | Single source of truth, git-friendly, no orphan state |
| vim-mode fix | Re-add to host `__krytonPluginDeps` | Type already declares it; smallest plugin bundle |
| Test framework | Vitest | Rich DX; snapshots; jsdom support for future |
| Expansion scope | All four selected (SRS, RSS scheduler, templater picker, theme presets) | User-confirmed |

## Architecture

### Shared infrastructure
- `vitest` added to [kryton-plugins/package.json](../../../package.json) devDependencies.
- `npm test` runs `scripts/test-plugins.js && vitest run`.
- Per-plugin tests at `plugins/<name>/__tests__/*.test.js`, importing the plugin's pure-function exports.
- No change to `scripts/build-plugins.js` — CDN libs require no bundling step.

### Host (kryton/) changes — minimal

1. **vim deps**: import `vim, Vim` from `@replit/codemirror-vim` in [kryton/packages/ui/src/plugins/PluginRoot.tsx](../../../../kryton/packages/ui/src/plugins/PluginRoot.tsx); inject into `window.__krytonPluginDeps`. Add `@replit/codemirror-vim@^6.2.1` to [kryton/packages/ui/package.json](../../../../kryton/packages/ui/package.json).
2. **Fence helper**: `api.notes.replaceFenceAtRange(path, {startLine, endLine}, newSource)` — implemented in `kryton/packages/ui/src/plugins/api/notes.ts`, splices a line range and writes back via existing `api.notes.update`. Type added to [kryton-plugins/types/client.d.ts](../../../types/client.d.ts).
3. **Confirm `getNoteContent`**: ensure the `/note-content` route the `presentation` plugin already uses is part of the documented plugin API (it currently is, but verify).

## Plugin-by-plugin work

### Fixes

#### checklist
- Remove `api.api.fetch('/notes/${path}')` call.
- Replace with `api.notes.openByPath(path)`.
- Add unit test covering the parser that extracts `- [ ]` / `- [x]` from note bodies.

#### git-backup
- Replace `exec()` with `execFile('git', [...args], { cwd })` for `add`, `commit`, `status`, `log`, `push`.
- Validate `cwd`: must be inside `dataDir`. Reject any path containing `..`.
- Pre-flight `git --version` check on activate; surface a clear error to the user if unavailable.
- Tests: argument-array construction for commit/push given pathological inputs (`$(rm -rf /)`, backticks, semicolons).

#### templater
- Replace hardcoded `templates[0]` with a real picker modal listing every template.
- Templates may contain `{{prompt:VarName}}` tokens; before insertion, modal collects values via form inputs and substitutes.
- Existing `{{date}}`, `{{time}}`, `{{now}}`, `{{random}}`, `{{date:FORMAT}}` keep working.
- Tests: `applyDateFormat` token grid; `{{prompt:X}}` substitution; precedence when same var appears multiple times.

#### rss-reader
- Swap regex parsing for `fast-xml-parser@4.4.1` loaded via esm.sh.
- Add `refreshIntervalMinutes` setting (default 30, 0 = manual only).
- On server activate, start `setInterval` polling subscribed feeds; bump per-feed `unread` count when new GUIDs appear.
- Manual refresh button still works.
- Tests: parser correctly handles CDATA, namespaces, both RSS 2.0 and Atom; unread-count diffing.

#### lint (mechanical)
- All 14 warnings resolved: rename unused params/imports to `_`, swap `!=`→`!==` in [plugins/rss-reader/server/index.js:20](../../../plugins/rss-reader/server/index.js).

### New interactive implementations

#### Kanban (real)
- **Render path**: `\`\`\`kanban` code fence → board widget.
- **Library**: SortableJS `https://esm.sh/sortablejs@1.15.2`.
- **Persistence**: card mutations debounced 300ms, then re-serialize the board model back to markdown and call `api.notes.replaceFenceAtRange`.
- **Markdown round-trip format**:
  ```
  ```kanban
  ## Column Name
  - Card text
  - [x] Completed card
  - [#abc123] Card with stable id (assigned on first edit)
  ```
  ```
- **Interactions**: drag between columns, click-to-edit text, `+ Add card`, `+ Add column`, `…` menu for delete/rename.
- **Tests**: board ↔ markdown round-trip is identity for hand-written input; mutations preserve unrelated note text.

#### Excalidraw (real)
- **Render path**: `\`\`\`excalidraw` code fence → preview SVG + "Open editor" button.
- **Library**: `@excalidraw/excalidraw@0.17.6` from esm.sh; React/ReactDOM from `__krytonPluginDeps`.
- **Editor**: full-screen modal hosting `<Excalidraw>`; "Save" writes scene JSON back to the fence.
- **Preview caching**: on save, plugin also exports an SVG via `exportToSvg()` and writes it into a sibling `\`\`\`excalidraw-preview` fence directly after the source fence. Reading skips the editor entirely if preview exists.
- **Read-only fallback**: if CDN load fails, preview SVG still renders; the "Open editor" button shows a friendly error.
- **Tests**: malformed JSON renders error state, not crash; preview-fence pairing logic round-trips.

#### vim-mode (rewire)
- Remove dead `/toggle` fetch from client; back the toggle with `api.storage` instead.
- Remove the 200ms DOM polling — listen for `vim-mode-change` events on the CM6 view via `Vim.defineEx`/`CodeMirror.on(view, 'vim-mode-change', cb)`.
- On host: PluginRoot.tsx injection (see above).
- Manual verification: keys in Normal mode navigate; `i` enters Insert; status bar updates without polling.
- Tests deferred (requires jsdom + CM6 harness — separate spec).

### Expansions

#### Flashcards SRS
- New module `plugins/flashcards/srs.js` implementing SM-2: `nextReview({card, rating})` returns `{intervalDays, easeFactor, repetitions, dueAt}`.
- Per-card review state keyed by `sha1(question + answer)` (stable across reorderings).
- Persisted via `api.storage.set('reviews', {…})` per-user.
- UI: "Rate: Again / Hard / Good / Easy" row under the answer; cards due today shown first; rest hidden until due.
- Tests: SM-2 numeric correctness on standard fixtures.

#### RSS scheduler
- Covered above in rss-reader fix section (interval + unread diff).

#### Templater picker
- Covered above in templater fix section.

#### Theme-settings presets
- New `presets.js` exporting `{ default, solarized-light, solarized-dark, nord, dracula }` each with `{accent, fontFamily, fontSize, lineHeight, contentMaxWidth, mode}`.
- Add explicit `mode: 'light' | 'dark' | 'system'` setting.
- Preset dropdown in settings; selecting a preset overwrites the relevant fields; user can still tweak.
- Dark mode toggles `data-theme="dark"` on `:root` and emits compatible CSS variables.
- Tests: preset application produces expected CSS-var set; mode `system` follows `prefers-color-scheme`.

## Documentation

- Update [kryton-plugins/README.md](../../../README.md) plugins table with all 25 entries and accurate one-line descriptions.
- Update [docs/PLUGIN_API.md](../../PLUGIN_API.md) with `api.notes.replaceFenceAtRange` and `api.notes.openByPath`.
- Update [docs/CONTRIBUTING.md](../../CONTRIBUTING.md) with `npm test` instructions for vitest.

## Verification plan

Per repo memory rule "verify by actually running the app":

1. `npm run lint` — 0 warnings, 0 errors.
2. `npm run typecheck` — green.
3. `npm test` — syntax checks **and** vitest pass; coverage ≥80% on the touched pure-function modules.
4. Manual smoke checklist (boot `kryton-desktop` or web dev server):
   - Load each of the 25 plugins; activate; exercise primary feature.
   - Round-trip a Kanban board and an Excalidraw drawing through the fence; reopen note; state preserved.
   - vim-mode: enter editor; `i`/`Esc`/`h`/`j`/`k`/`l` work; status bar reflects mode.
   - git-backup: commit with message containing `'; rm -rf /; #` — verify the literal string lands in the commit, no shell execution.
   - Templater: insert a template containing `{{prompt:Title}}` — verify modal prompt appears.
   - Flashcards: rate cards `Good`; reopen later; due ordering respected.

## Out of scope

- jsdom + CM6 harness for vim-mode interactive tests.
- Excalidraw collaborative editing.
- Kanban swimlanes / labels / WIP limits.
- RSS OPML import/export.
- Plugin marketplace UI changes.

## Execution

After spec approval, [writing-plans](.) skill produces a phased implementation plan. Implementation runs via parallel implementer agents with strict file ownership boundaries per memory rule [feedback_workflow.md](../../../../../.claude/projects/-Users-pascal-Development-Kryton/memory/feedback_workflow.md). Group split:

1. **infra agent** — vitest setup, host `__krytonPluginDeps` changes, `replaceFenceAtRange` API helper, lint cleanup.
2. **fixes agent** — checklist, git-backup, templater fix+picker.
3. **rss agent** — rss-reader parser swap + scheduler.
4. **kanban agent** — real interactive kanban + round-trip tests.
5. **excalidraw agent** — real interactive excalidraw + preview caching.
6. **vim agent** — plugin-side rewire (depends on infra agent completing host injection).
7. **expansions agent** — flashcards SRS + theme presets.
8. **docs agent** — README + PLUGIN_API + CONTRIBUTING updates.

Final verification phase is sequential on main thread.
