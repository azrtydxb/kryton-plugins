// Client-side Plugin API types
// Mirrors host types defined in
// kryton/packages/ui/src/plugins/types.ts. Keep in sync with the host.

export interface CodeFenceRange {
  startLine: number;
  endLine: number;
}

export interface CodeFenceRendererProps {
  /** The fence body, without the surrounding ``` lines. */
  content: string;
  /** Path of the host note. May be empty when no path is known. */
  notePath: string;
  /**
   * Range of the entire fence (including opening + closing ``` lines)
   * in the PARSED note source (after frontmatter stripping and
   * wikilink-embed substitution). Undefined when source position data
   * is not available.
   *
   * Prefer `rawRange` for round-tripping to disk.
   */
  range?: CodeFenceRange;
  /**
   * Range of the entire fence in the RAW on-disk content — the same
   * coordinate space as the string returned by
   * `api.notes.get(path).content`. Suitable for use with
   * `api.notes.replaceFenceAtRange` without further adjustment.
   * Undefined when the fence can't be located in the raw source.
   */
  rawRange?: CodeFenceRange;
  /**
   * Full original fence block including the surrounding ``` markers.
   * Undefined when source position data is not available.
   */
  source?: string;
}

export interface PluginNoteEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: PluginNoteEntry[];
}

export interface PluginNoteFile {
  path: string;
  content: string;
  title: string;
  modifiedAt: string;
}

// EditorPlugin / EditorState / Transaction are the host editor's
// internal types. Plugins targeting api.editor receive these as opaque
// values — only the shape used by onKeyDown is named here.

export interface EditorSelection {
  anchor: number;
  head: number;
}

export interface EditorState {
  doc: string;
  selection: EditorSelection;
  // Other fields (tree, etc.) are opaque to plugins.
  [key: string]: unknown;
}

export interface Operation {
  kind: "insert" | "delete" | "replace";
  [key: string]: unknown;
}

export interface Transaction {
  ops: Operation[];
  selection: EditorSelection | null;
}

export type KeyDownResult = Transaction | "prevent-default" | null;

export interface SuggestionTrigger {
  kind: "wikilink" | "tag" | "slash";
  /** Offset where the query text starts (after the trigger char/chars). */
  from: number;
  /** Offset of the caret at trigger time. */
  caret: number;
  /** Raw text typed since the trigger char. */
  query: string;
}

export interface Suggestion {
  id: string;
  label: string;
  kind: "note" | "tag" | "command";
  /**
   * Text inserted in place of [trigger.from..trigger.caret]. May contain a
   * literal "$cursor" marker — that marker is stripped and the caret is
   * placed at its position (e.g. `**$cursor**` lands the caret between the
   * asterisks).
   */
  insert: string;
  /**
   * When true, the trigger character(s) themselves are also consumed by the
   * replacement. Slash defaults to true (so `/h1` becomes `# ` not `/# `);
   * tag/wikilink default to false (the `#` or `[[` are syntactic markers).
   */
  replaceTrigger?: boolean;
}

export interface EditorPlugin {
  name: string;
  decorations?(state: EditorState): unknown[];
  commands?: Record<string, (state: EditorState) => Transaction>;
  suggestions?(state: EditorState, trigger: SuggestionTrigger): Promise<Suggestion[]>;
  onTransaction?(tr: Transaction, state: EditorState): Transaction | null;
  /**
   * First plugin returning non-null wins. "prevent-default" swallows the
   * key event without dispatching a transaction.
   */
  onKeyDown?(e: KeyboardEvent, state: EditorState): KeyDownResult;
}

export interface ClientPluginAPI {
  ui: {
    registerSidebarPanel(component: any, options: { id: string; title: string; icon: string; order?: number }): void;
    registerStatusBarItem(component: any, options: { id: string; position: "left" | "right"; order?: number }): void;
    registerEditorToolbarButton(component: any, options: { id: string; order?: number }): void;
    registerSettingsSection(component: any, options: { id: string; title: string }): void;
    registerPage(component: any, options: { id: string; path: string; title: string; icon: string; showInSidebar?: boolean }): void;
    registerNoteAction(options: { id: string; label: string; icon: string; onClick: (notePath: string) => void }): void;
    /**
     * Close the currently focused note pane (Cmd+W intent). No-op when
     * no pane is open or the host has not registered a closePane hook.
     */
    closePane(): void;
  };
  markdown: {
    registerCodeFenceRenderer(language: string, component: any): void;
    registerPostProcessor(fn: (html: string) => string): void;
  };
  commands: {
    register(command: { id: string; name: string; shortcut?: string; execute: () => void }): void;
  };
  context: {
    useCurrentUser(): { id: string; name: string; email: string } | null;
    useCurrentNote(): { path: string; content: string } | null;
    useTheme(): "light" | "dark";
    usePluginSettings(key: string): unknown;
    setPluginSetting(key: string, value: unknown): Promise<void>;
  };
  api: {
    fetch(path: string, options?: RequestInit): Promise<Response>;
  };
  notes: {
    list(folder?: string): Promise<PluginNoteEntry[]>;
    get(path: string): Promise<PluginNoteFile>;
    getContent(path: string): Promise<string>;
    create(path: string, content: string): Promise<{ ok: true }>;
    update(path: string, content: string): Promise<{ ok: true }>;
    delete(path: string): Promise<{ ok: true }>;
    openByPath(path: string): Promise<{ ok: true }>;
    replaceFenceAtRange(
      path: string,
      range: CodeFenceRange,
      newSource: string,
    ): Promise<{ ok: true }>;
    /**
     * Persist the currently focused editor buffer via the host save
     * pipeline. Resolves with the saved path + ISO timestamp; rejects
     * when no editor is focused or the host has not registered a
     * saveCurrent hook.
     */
    saveCurrent(): Promise<{ path: string; savedAt: string }>;
  };
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<{ ok: true }>;
    delete(key: string): Promise<{ ok: true }>;
    list(prefix?: string): Promise<
      Array<{ key: string; value: unknown; userId: string | null }>
    >;
  };
  editor: {
    registerPlugin(plugin: EditorPlugin): () => void;
    getActiveState(): EditorState | null;
    dispatch(tr: Transaction): void;
    onTransaction(cb: (tr: Transaction, state: EditorState) => void): () => void;
    /**
     * Set a host-level editor option. Known keys today:
     *   - "lineNumbers" (boolean, default false) — toggles the gutter
     *     rendered by EditorView. vim-mode's `:set number` maps to this.
     * Unknown keys are accepted (forward compatibility).
     */
    setOption(name: string, value: boolean | number | string): void;
  };
  notify: {
    info(message: string): void;
    success(message: string): void;
    error(message: string): void;
  };
}

// Host dependencies available via window.__krytonPluginDeps.
// Vim is implemented natively in the vim-mode plugin (Phase 2.C) — no
// CodeMirror dependency is injected here.
export interface KrytonPluginDeps {
  React: typeof import("react");
  ReactDOM: typeof import("react-dom");
}

declare global {
  interface Window {
    __krytonPluginDeps: KrytonPluginDeps;
  }
}
