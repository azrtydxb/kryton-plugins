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
   * in the parsed note source. Undefined when source position data is
   * not available.
   */
  range?: CodeFenceRange;
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

export interface EditorPlugin {
  name: string;
  decorations?(state: EditorState): unknown[];
  commands?: Record<string, (state: EditorState) => Transaction>;
  suggestions?(state: EditorState, trigger: unknown): Promise<unknown[]>;
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
