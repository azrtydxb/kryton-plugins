# Kryton Plugin API Reference

This guide covers everything you need to build plugins for Kryton.

## Plugin Structure

Every plugin lives in its own directory under `plugins/`:

```
plugins/my-plugin/
  manifest.json       # Required: plugin metadata
  server/
    index.ts          # Optional: server-side entry point (TypeScript, built to CJS)
  client/
    index.ts          # Optional: client-side entry point (TypeScript, built to ESM)
```

Plugins are written in TypeScript. The build step (`npm run build`) compiles `.ts` files to `.js` using esbuild. Type definitions are available in `types/server.d.ts` and `types/client.d.ts`.

A plugin must have at least one entry point (server, client, or both).

---

## Manifest Format

The `manifest.json` file describes your plugin:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Your Name",
  "minKrytonVersion": "2.0.0",
  "server": "server/index.js",
  "client": "client/index.js",
  "settings": [
    {
      "key": "enabled",
      "type": "boolean",
      "default": true,
      "label": "Enable this feature",
      "perUser": true
    }
  ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, must match directory name |
| `name` | string | Human-readable display name |
| `version` | string | Semver version string |
| `description` | string | Brief description of what the plugin does |
| `author` | string | Plugin author name |
| `minKrytonVersion` | string | Minimum Kryton version required |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `server` | string | Path to server entry point (relative to plugin dir) |
| `client` | string | Path to client entry point (relative to plugin dir) |
| `settings` | array | Plugin settings declarations |

### Settings

Each setting object has:

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Setting identifier |
| `type` | string | `"boolean"`, `"string"`, `"number"`, `"select"` |
| `default` | any | Default value |
| `label` | string | Display label in settings UI |
| `perUser` | boolean | If true, each user can override this setting. If false, admin-only. |
| `options` | array | For `"select"` type: `[{ "value": "a", "label": "Option A" }]` |

---

## Server-Side API

Server plugins are written in TypeScript and must export `activate(api)` and `deactivate()`. They are compiled to CommonJS by esbuild.

```typescript
import type { PluginAPI } from '../../../types/server';

export function activate(api: PluginAPI): void {
  // Plugin initialization
}

export function deactivate(): void {
  // Cleanup (optional - PluginManager handles route/event removal)
}
```

### `api.notes`

Access and manipulate notes.

| Method | Description |
|--------|-------------|
| `api.notes.get(userId, path)` | Get a note by user ID and path |
| `api.notes.list(userId, folder?)` | List notes for a user |
| `api.notes.create(userId, path, content)` | Create a new note |
| `api.notes.update(userId, path, content)` | Update an existing note |
| `api.notes.delete(userId, path)` | Delete a note |

### `api.events`

Subscribe to system events.

| Method | Description |
|--------|-------------|
| `api.events.on(event, handler)` | Listen for an event |
| `api.events.off(event, handler)` | Remove an event listener |

**Available Events:**
- `note:afterSave` - Fired after a note is saved. Context: `{ userId, path, content }`
- `note:afterDelete` - Fired after a note is deleted. Context: `{ userId, path }`
- `note:afterCreate` - Fired after a note is created. Context: `{ userId, path, content }`

### `api.routes`

Register custom HTTP endpoints. Routes are prefixed with `/api/plugins/{pluginId}/`.

| Method | Description |
|--------|-------------|
| `api.routes.register(method, path, handler)` | Register a route (`get`, `post`, `put`, `delete`) |

```javascript
api.routes.register("get", "/stats", async (req, res) => {
  res.json({ status: "ok" });
});
```

### `api.storage`

Key-value storage scoped to the plugin.

| Method | Description |
|--------|-------------|
| `api.storage.get(key)` | Get a stored value |
| `api.storage.set(key, value)` | Store a value |
| `api.storage.delete(key)` | Remove a stored value |
| `api.storage.list()` | List all keys |

### `api.database`

Direct database access (use with caution).

| Method | Description |
|--------|-------------|
| `api.database.query(sql, params)` | Execute a SQL query |

### `api.settings`

Access plugin settings.

| Method | Description |
|--------|-------------|
| `api.settings.get(key, userId?)` | Get a setting value |
| `api.settings.set(key, value, userId?)` | Set a setting value |

### `api.search`

Integration with the search system.

| Method | Description |
|--------|-------------|
| `api.search.register(indexer)` | Register a custom search indexer |

### `api.log`

Structured logging scoped to the plugin.

| Method | Description |
|--------|-------------|
| `api.log.info(message)` | Info-level log |
| `api.log.warn(message)` | Warning-level log |
| `api.log.error(message)` | Error-level log |
| `api.log.debug(message)` | Debug-level log |

---

## Client-Side API

Client plugins are written in TypeScript and must export an `activate(api)` function. A `deactivate()` export is recommended for cleanup. They are compiled to ESM by esbuild.

```typescript
import type { ClientPluginAPI } from '../../../types/client';

export function activate(api: ClientPluginAPI): void {
  // Plugin initialization
}

export function deactivate(): void {
  // Cleanup
}
```

### `api.ui`

Register UI components in designated slots.

#### UI Slots

| Slot | Registration Method | Description |
|------|---------------------|-------------|
| sidebar | `api.ui.registerSidebarPanel(Component, opts)` | Sidebar panel item |
| statusbar-left | `api.ui.registerStatusBarItem(Component, { position: 'left', ... })` | Left status bar |
| statusbar-right | `api.ui.registerStatusBarItem(Component, { position: 'right', ... })` | Right status bar |
| editor-toolbar | `api.ui.registerEditorToolbarButton(Component, opts)` | Editor toolbar button (Edit/Split modes only) |
| topbar | `api.ui.registerTopbarAction(Component, opts)` | Always-visible action in the global top bar, next to `+` New note and the search box |
| pages | `api.ui.registerPage(Component, opts)` | Custom full-page route |
| note-actions | `api.ui.registerNoteAction(opts)` | Note context menu actions |
| settings-section | `api.ui.registerSettingsSection(Component, opts)` | Plugin settings panel |

Options typically include `id` (string) and `order` (number for positioning).

#### `registerTopbarAction(component, { id, order? })`

Renders a component into the global top bar — sitting next to the "+" New
note button and the search field. Unlike the editor toolbar, top-bar actions
are visible in every layout (Preview, Edit, Split, page views), so this is
the right slot for app-wide entry points such as bulk import, global
search overrides, or workspace-level commands.

The `mass-upload` plugin uses it to expose its Upload modal trigger:

```ts
api.ui.registerTopbarAction(
  () => h(UploadButton, { api }),
  { id: 'mass-upload-btn', order: 0 },
);
```

#### `closePane()`

Imperative helper that closes the currently focused note pane (the
Cmd+W intent). No-op when no pane is open. Useful for plugins that
manage their own keybindings or finish an editing workflow programmatically.

### `api.editor`

Extend the custom Kryton editor. The editor is **not** CodeMirror — it is a bespoke
transactional editor implemented in `packages/ui/src/editor/state`. Plugins extend
it by registering an `EditorPlugin` value, not by injecting CodeMirror extensions.

| Method | Description |
|--------|-------------|
| `api.editor.registerPlugin(plugin)` | Register an `EditorPlugin`. Returns an `unregister()` function. |
| `api.editor.getActiveState()` | Snapshot of the focused editor's `EditorState` (`{ doc, selection: { anchor, head }, ... }`), or `null` if no editor is mounted. |
| `api.editor.dispatch(tr)` | Dispatch a `Transaction` (insert / delete / replace ops + optional new selection) to the active editor. |
| `api.editor.onTransaction(cb)` | Subscribe to every transaction applied to the active editor. Returns an unsubscribe fn. |
| `api.editor.setOption(name, value)` | Set a host-level editor option. Known key: `"lineNumbers"` (boolean, default false) — toggles the gutter. Unknown keys are accepted for forward compatibility. |

The `slash-commands` plugin shows the minimal `registerPlugin` shape —
in this case wiring only the `suggestions` hook to power the `/`
quick-insert menu:

```ts
const unregister = api.editor.registerPlugin({
  name: 'slash-commands',
  suggestions: async (_state, trigger) => {
    if (trigger?.kind !== 'slash') return [];
    return filterCommands(String(trigger.query ?? '')).map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      kind: 'command' as const,
      insert: resolveInsert(cmd),
    }));
  },
});
```

#### `EditorPlugin` interface

Defined in `packages/ui/src/editor/state/plugins.ts`:

```ts
interface EditorPlugin {
  name: string;
  decorations?(state: EditorState): DecorationSpec[];
  commands?: Record<string, (state: EditorState) => Transaction>;
  suggestions?(state: EditorState, trigger: SuggestionTrigger): Promise<Suggestion[]>;
  onTransaction?(tr: Transaction, state: EditorState): Transaction | null;
  onKeyDown?(e: KeyboardEvent, state: EditorState): Transaction | "prevent-default" | null;
}
```

- `decorations` — return inline decorations for the current state. Recomputed on every state change.
- `commands` — named command functions usable from `api.commands.register` or directly via `api.editor.dispatch`.
- `suggestions` — async source of completion items for `wikilink`, `tag`, or `slash` triggers.
- `onTransaction` — observe (and optionally rewrite) transactions before they apply. Return `null` to leave the transaction untouched.
- `onKeyDown` — native keydown hook. Runs **before** the editor's own keymap. Return a `Transaction` to apply and consume the event, `"prevent-default"` to swallow without dispatching, or `null` to pass through to the next plugin / native handling. The **first non-null result wins**; later plugins do not run.

### `api.markdown`

Extend markdown rendering.

| Method | Description |
|--------|-------------|
| `api.markdown.registerCodeFenceRenderer(language, component)` | Render a custom React component for a fenced code block of the given language. |
| `api.markdown.registerPostProcessor(fn)` | Transform rendered HTML before it is mounted. |

#### Code-fence renderer props

The component receives:

```ts
interface CodeFenceRendererProps {
  /** The fence body, without the surrounding ``` lines. */
  content: string;
  /** Path of the host note. May be empty when no path is known. */
  notePath: string;
  /**
   * Range of the entire fence in the PARSED note source (after frontmatter
   * stripping + wikilink-embed substitution). Undefined when source position
   * data is not available. Prefer `rawRange` for round-tripping to disk.
   */
  range?: { startLine: number; endLine: number };
  /**
   * Range of the entire fence in the RAW on-disk content — the same coordinate
   * space as `api.notes.get(path).content`. Pass this straight to
   * `api.notes.replaceFenceAtRange` without further adjustment. Undefined when
   * the fence can't be located in the raw source.
   */
  rawRange?: { startLine: number; endLine: number };
  /** Full original fence block including the surrounding ``` markers. */
  source?: string;
  /**
   * True when the user is in an editing context (Edit or Split layout).
   * False in pure Preview mode. Gate editable controls (drag handles,
   * delete buttons, inline inputs) on this flag so Preview stays read-only.
   */
  interactive?: boolean;
}
```

> ⚠️ The `range` field is **parsed-body-relative**, not raw-file relative.
> Prefer `rawRange` when round-tripping edits via
> `api.notes.replaceFenceAtRange`. If neither `rawRange` nor a stable
> `source` string is available, locate-and-replace against
> `api.notes.get(path).content` is the safest fallback.

#### Gating editable controls on `interactive`

The `kanban` plugin uses `interactive` to keep its read-only renderer
identical between Preview and Split, only enabling drag/delete/inline-add
when the host marks the surface as editable:

```ts
function KanbanFenceRenderer(props: FenceRendererProps): any {
  const { content, notePath, source, interactive } = props;
  return h(KanbanBoard, {
    initial: content,
    onChange: (next) => persistFence(api, notePath, source, next),
    // Default to false so Preview mode stays read-only even on older hosts
    // that don't forward the flag.
    interactive: interactive === true,
  });
}
```

### `api.commands`

Register keyboard commands.

| Method | Description |
|--------|-------------|
| `api.commands.register(id, opts)` | Register a command with keybinding |

```javascript
api.commands.register("my-plugin:do-thing", {
  label: "Do Thing",
  keybinding: "Ctrl-Shift-T",
  run: () => { /* ... */ },
});
```

### `api.context`

Access app context and plugin settings from React components.

| Method | Description |
|--------|-------------|
| `api.context.usePluginSettings(key)` | React hook to read a plugin setting |
| `api.context.useCurrentNote()` | React hook to get the current note |
| `api.context.useCurrentUser()` | React hook to get the current user |

### `api.api`

Make authenticated API calls to the Kryton backend.

| Method | Description |
|--------|-------------|
| `api.api.fetch(path, options)` | Fetch from plugin's API endpoint (auto-prefixed) |

### `api.notes` (client)

Read and modify notes belonging to the **current user**. Unlike the server-side
`api.notes`, the client variant takes no `userId` — operations are always
scoped to the signed-in user.

| Method | Description |
|--------|-------------|
| `api.notes.list(folder?)` | List notes (optionally under a folder). Returns `PluginNoteEntry[]`. |
| `api.notes.get(path)` | Get a note with metadata: `{ path, content, title, modifiedAt }`. |
| `api.notes.getContent(path)` | Get only the raw content string of a note. |
| `api.notes.create(path, content)` | Create a new note. |
| `api.notes.update(path, content)` | Overwrite a note's content. |
| `api.notes.delete(path)` | Delete a note. |
| `api.notes.openByPath(path)` | Open the note in the active editor pane. |
| `api.notes.replaceFenceAtRange(path, range, newSource)` | Replace lines `[range.startLine .. range.endLine]` (0-based, inclusive) of the raw note file with `newSource`. **Expects raw-file line numbers** — pass `rawRange` from a fence renderer, not `range`. |
| `api.notes.saveCurrent()` | Persist the currently focused editor buffer via the host save pipeline. Resolves with `{ path, savedAt }`; rejects when no editor is focused. |

**`replaceFenceAtRange` example.** When you have a verified raw-file range
(e.g. `rawRange` forwarded by the host to a fence renderer):

```js
await api.notes.replaceFenceAtRange(
  notePath,
  rawRange,
  "```kanban\n## Todo\n- [ ] new card\n```",
);
```

When only `source` is available (older hosts, or when `rawRange` is
undefined), the kanban plugin's locate-and-replace pattern is the safe
fallback:

```js
async function persistFence(api, notePath, oldSource, newSource) {
  const { content } = await api.notes.get(notePath);
  if (!content.includes(oldSource)) return;
  await api.notes.update(notePath, content.replace(oldSource, newSource));
}
```

### `api.storage` (client)

Per-plugin, per-user key-value storage. Values are persisted server-side
and isolated by both plugin id and the signed-in user — two users running
the same plugin see independent stores, and two plugins on the same
account can't read each other's keys. Values must be JSON-serialisable.

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key: string) => Promise<unknown>` | Read a value. Resolves to `unknown` (caller validates). |
| `set` | `(key: string, value: unknown) => Promise<{ ok: true }>` | Write a JSON-serialisable value. |
| `delete` | `(key: string) => Promise<{ ok: true }>` | Remove a key. |
| `list` | `(prefix?: string) => Promise<Array<{ key, value, userId }>>` | List entries, optionally filtered by key prefix. |

The `flashcards` plugin uses it to remember study progress across
sessions:

```ts
const STORAGE_KEY = 'flashcards:progress';

const saved = await api.storage.get(STORAGE_KEY).catch(() => null);
// ... mutate progress ...
await api.storage.set(STORAGE_KEY, updated);
```

### `api.notify`

Show toast notifications.

| Method | Description |
|--------|-------------|
| `api.notify.success(message)` | Green success toast |
| `api.notify.error(message)` | Red error toast |
| `api.notify.info(message)` | Blue info toast |

---

## Client Plugin Dependencies

Client plugins can access shared dependencies via `window.__krytonPluginDeps` (typed in `types/client.d.ts`):

```typescript
const { React, ReactDOM } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect } = React;
```

Available dependencies:
- `React` — the React library used by the host (use this — do not bundle your own copy)
- `ReactDOM` — paired ReactDOM, for plugins that mount their own portals

> ℹ️ Kryton's editor is **not** CodeMirror. Earlier docs referenced a
> `getCM` export here; it was never wired and has since been removed. Plugins
> that want to extend the editor should use `api.editor.registerPlugin` with an
> `EditorPlugin` instead (see [`api.editor`](#apieditor)).

---

## Lifecycle

1. **Install**: Plugin files are copied to the Kryton server's plugin directory
2. **Activate**: `activate(api)` is called with the plugin API
3. **Runtime**: Plugin is active, handling events and rendering UI
4. **Deactivate**: `deactivate()` is called during shutdown or uninstall
5. **Uninstall**: Plugin files are removed

---

## Example: Minimal Plugin

A simple plugin that adds a status bar item showing the current time.

**manifest.json:**
```json
{
  "id": "clock",
  "name": "Clock",
  "version": "1.0.0",
  "description": "Shows current time in the status bar",
  "author": "Example",
  "minKrytonVersion": "2.0.0",
  "client": "client/index.js"
}
```

**client/index.ts:**
```typescript
import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect } = React;

let interval: ReturnType<typeof setInterval> | undefined;

export function activate(api: ClientPluginAPI): void {
  function Clock(): any {
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    useEffect(() => {
      interval = setInterval(() => {
        setTime(new Date().toLocaleTimeString());
      }, 1000);
      return () => clearInterval(interval);
    }, []);
    return h("span", { className: "text-xs text-gray-400" }, time);
  }

  api.ui.registerStatusBarItem(Clock, {
    id: "clock",
    position: "right",
    order: 99,
  });
}

export function deactivate(): void {
  if (interval) clearInterval(interval);
}
```
