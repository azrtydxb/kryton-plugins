// Slash-commands plugin — ported to the custom editor (Phase 2 / 2026-05-19).
//
// The original implementation targeted CodeMirror 6 ViewPlugins, which no
// longer exist in the host. The host's editor exposes an `EditorPlugin`
// interface with an `onKeyDown` cascade and a (declared-but-unconsumed)
// `suggestions` hook. As of this writing nothing in the host renders the
// suggestion popup, so we drive our own absolute-positioned menu via DOM
// and intercept Arrow/Enter/Esc through `onKeyDown`.
//
// When the host later wires up a built-in suggestion UI consumer of the
// `suggestions(state, trigger)` hook, this plugin should be simplified to
// just return `Suggestion[]` from that hook.

import type {
  ClientPluginAPI,
  EditorState,
  KeyDownResult,
  Transaction,
} from '../../../types/client';

const { React, ReactDOM } = window.__krytonPluginDeps;
const { createElement: h, useEffect } = React;

// ---------------------------------------------------------------------------
// Command table — kept in sync with ../commands.js (esbuild runs with
// bundle:false so we cannot import from there at runtime).
// ---------------------------------------------------------------------------

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  // Either a literal insert string (possibly containing `$cursor`) or a
  // dynamic kind that we evaluate at apply-time.
  insert: string | null;
  dynamic?: 'date' | 'time' | 'datetime';
}

function todayISO(d: Date = new Date()): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function nowHM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function nowISO(d: Date = new Date()): string {
  return d.toISOString();
}

const COMMANDS: SlashCommand[] = [
  { id: 'h1',         label: 'Heading 1',     description: 'Large heading',                       insert: '# ' },
  { id: 'h2',         label: 'Heading 2',     description: 'Medium heading',                      insert: '## ' },
  { id: 'h3',         label: 'Heading 3',     description: 'Small heading',                       insert: '### ' },
  { id: 'bold',       label: 'Bold',          description: 'Bold text',                           insert: '**$cursor**' },
  { id: 'italic',     label: 'Italic',        description: 'Italic text',                         insert: '*$cursor*' },
  { id: 'code',       label: 'Inline Code',   description: 'Inline code span',                    insert: '`$cursor`' },
  { id: 'codeblock',  label: 'Code Block',    description: 'Fenced code block',                   insert: '```lang\n$cursor\n```' },
  { id: 'quote',      label: 'Quote',         description: 'Block quote',                         insert: '> ' },
  { id: 'divider',    label: 'Divider',       description: 'Horizontal rule',                     insert: '\n---\n' },
  { id: 'table',      label: 'Table',         description: '2x2 table template',                  insert: '\n| Col1 | Col2 |\n|------|------|\n| $cursor |  |\n' },
  { id: 'todo',       label: 'Todo Item',     description: 'Task list item',                      insert: '- [ ] ' },
  { id: 'date',       label: 'Date',          description: "Insert today's date (YYYY-MM-DD)",    insert: null, dynamic: 'date' },
  { id: 'time',       label: 'Time',          description: 'Insert current time (HH:mm)',         insert: null, dynamic: 'time' },
  { id: 'datetime',   label: 'Datetime',      description: 'Insert current ISO datetime',         insert: null, dynamic: 'datetime' },
  { id: 'kanban',     label: 'Kanban Board',  description: 'Insert kanban code fence',            insert: '```kanban\n## Todo\n## In Progress\n## Done\n```' },
  { id: 'excalidraw', label: 'Excalidraw',    description: 'Insert excalidraw code fence',        insert: '```excalidraw\n{"elements":[]}\n```' },
  { id: 'mermaid',    label: 'Mermaid',       description: 'Insert mermaid diagram',              insert: '```mermaid\ngraph TD\n  A --> B\n```' },
];

function filterCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS.slice();
  const q = query.toLowerCase();
  return COMMANDS.filter((c) =>
    c.id.toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q)
  );
}

function resolveInsert(cmd: SlashCommand): string {
  if (cmd.dynamic === 'date') return todayISO();
  if (cmd.dynamic === 'time') return nowHM();
  if (cmd.dynamic === 'datetime') return nowISO();
  return cmd.insert ?? '';
}

// ---------------------------------------------------------------------------
// Trigger detection — "/" at start of line, or after whitespace, with no
// non-word characters between the slash and the caret.
// ---------------------------------------------------------------------------

interface TriggerMatch {
  /** Document offset of the "/" character. */
  from: number;
  /** Caret offset (== from + 1 + query.length). */
  caret: number;
  /** Text typed after the slash. */
  query: string;
}

function detectTrigger(state: EditorState): TriggerMatch | null {
  const caret = state.selection.head;
  if (caret !== state.selection.anchor) return null; // ignore non-empty sel
  const doc = state.doc;
  // Walk back from the caret to find a "/" preceded by whitespace or BOL.
  // Bail if we hit whitespace or another non-word character first.
  let i = caret;
  while (i > 0) {
    const ch = doc[i - 1];
    if (ch === '/') {
      const before = i >= 2 ? doc[i - 2] : '';
      const isBOL = i - 1 === 0 || before === '\n';
      const isAfterWS = before === ' ' || before === '\t';
      if (!isBOL && !isAfterWS) return null;
      const query = doc.slice(i, caret);
      // Disallow whitespace inside the query — the menu closes as soon as
      // the user types a space.
      if (/\s/.test(query)) return null;
      return { from: i - 1, caret, query };
    }
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    i -= 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Floating menu component (React, rendered into a body-level mount node).
// ---------------------------------------------------------------------------

interface MenuModel {
  visible: boolean;
  query: string;
  position: { top: number; left: number };
  activeIndex: number;
}

interface SlashMenuProps {
  model: MenuModel;
  onPick: (cmd: SlashCommand) => void;
  onHoverIndex: (i: number) => void;
}

function SlashMenu(props: SlashMenuProps): unknown {
  const { model, onPick, onHoverIndex } = props;
  const matches = filterCommands(model.query);

  // Reset hover on query change. Owner already mirrors activeIndex; this is
  // just for visual feedback when the list shrinks under the active row.
  useEffect(() => {
    if (model.activeIndex >= matches.length) onHoverIndex(0);
  }, [model.query, matches.length, model.activeIndex, onHoverIndex]);

  if (!model.visible) return null;

  const baseStyle: Record<string, string | number> = {
    position: 'fixed',
    top: model.position.top,
    left: model.position.left,
    background: 'var(--color-surface, #1e1e2e)',
    border: '1px solid var(--color-border, #3f3f5a)',
    borderRadius: '8px',
    zIndex: 9999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    fontFamily: 'inherit',
  };

  if (matches.length === 0) {
    return h('div', {
      style: { ...baseStyle, padding: '8px 10px', fontSize: '13px', color: 'var(--color-muted, #888)', minWidth: '220px' },
    }, 'No matching commands');
  }

  return h('div', {
    style: { ...baseStyle, padding: '4px', minWidth: '240px', maxHeight: '320px', overflowY: 'auto' },
  },
    matches.map((cmd, i) =>
      h('div', {
        key: cmd.id,
        onMouseDown: (e: MouseEvent) => { e.preventDefault(); onPick(cmd); },
        onMouseEnter: () => onHoverIndex(i),
        style: {
          display: 'flex',
          flexDirection: 'column',
          padding: '6px 10px',
          borderRadius: '4px',
          cursor: 'pointer',
          background: i === model.activeIndex ? 'var(--color-accent-muted, rgba(139,92,246,0.2))' : 'transparent',
        },
      },
        h('span', { style: { fontSize: '13px', fontWeight: 500, color: 'var(--color-text, #e0e0e0)' } }, cmd.label),
        h('span', { style: { fontSize: '11px', color: 'var(--color-muted, #888)', marginTop: '1px' } }, cmd.description)
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Plugin activation
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  // Mount point for the floating menu, lazily created on first use so we
  // don't pollute the DOM when the plugin is loaded but never triggered.
  let mountPoint: HTMLDivElement | null = null;
  let reactRoot: { render: (el: unknown) => void; unmount: () => void } | null = null;

  let model: MenuModel = {
    visible: false,
    query: '',
    position: { top: 0, left: 0 },
    activeIndex: 0,
  };
  // The trigger we are currently tracking. Snapshotted so apply() knows the
  // exact [from..caret] range to replace even if the document mutated.
  let trigger: TriggerMatch | null = null;

  function ensureMount(): void {
    if (mountPoint) return;
    mountPoint = document.createElement('div');
    mountPoint.id = 'slash-commands-menu-root';
    document.body.appendChild(mountPoint);
    if (ReactDOM && (ReactDOM as { createRoot?: unknown }).createRoot) {
      reactRoot = (ReactDOM as { createRoot: (el: HTMLElement) => typeof reactRoot }).createRoot(mountPoint) as typeof reactRoot;
    }
  }

  function render(): void {
    ensureMount();
    if (!mountPoint) return;
    const el = h(SlashMenu, {
      model,
      onPick: (cmd: SlashCommand) => apply(cmd),
      onHoverIndex: (i: number) => { model = { ...model, activeIndex: i }; render(); },
    });
    if (reactRoot) {
      reactRoot.render(el);
    } else if (ReactDOM && (ReactDOM as { render?: unknown }).render) {
      (ReactDOM as { render: (el: unknown, target: HTMLElement) => void }).render(el, mountPoint);
    }
  }

  function show(t: TriggerMatch): void {
    trigger = t;
    const pos = caretViewportPosition();
    model = { visible: true, query: t.query, position: pos, activeIndex: 0 };
    render();
  }

  function update(t: TriggerMatch): void {
    trigger = t;
    const matches = filterCommands(t.query);
    const activeIndex = Math.min(model.activeIndex, Math.max(matches.length - 1, 0));
    model = { ...model, visible: true, query: t.query, activeIndex };
    render();
  }

  function hide(): void {
    if (!model.visible && !trigger) return;
    trigger = null;
    model = { ...model, visible: false };
    render();
  }

  function caretViewportPosition(): { top: number; left: number } {
    // Read the caret rect from the DOM selection. Falls back to a sensible
    // default if there's no selection range (e.g. focus lost mid-render).
    try {
      const sel = window.getSelection?.();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getClientRects()[0] || range.getBoundingClientRect();
        if (rect && (rect.top || rect.left)) {
          return { top: rect.bottom + 4, left: rect.left };
        }
      }
    } catch {
      // ignore
    }
    return { top: 120, left: 120 };
  }

  function apply(cmd: SlashCommand): void {
    if (!trigger) { hide(); return; }
    const state = api.editor.getActiveState();
    if (!state) { hide(); return; }

    const insert = resolveInsert(cmd);
    const cursorMarker = '$cursor';
    const markerIdx = insert.indexOf(cursorMarker);
    const finalText = markerIdx >= 0
      ? insert.slice(0, markerIdx) + insert.slice(markerIdx + cursorMarker.length)
      : insert;
    const caretOffset = markerIdx >= 0
      ? markerIdx
      : finalText.length;

    // Replace [trigger.from .. current caret] with finalText. We re-read the
    // caret from the live state in case it moved since the trigger fired.
    const liveCaret = state.selection.head;
    const from = trigger.from;
    const to = Math.max(liveCaret, trigger.caret);
    const tr: Transaction = {
      ops: [{ kind: 'replace', from, to, text: finalText }],
      selection: { anchor: from + caretOffset, head: from + caretOffset },
    };
    hide();
    api.editor.dispatch(tr);
  }

  // Register the editor plugin. We use both:
  //  - `suggestions` so that when the host gains a built-in suggestion UI
  //    (see kryton/packages/ui/src/editor/state/plugins.ts), we get picked
  //    up automatically without a code change.
  //  - `onKeyDown` to drive the DIY popup in the meantime, intercepting
  //    Arrow/Enter/Escape while the menu is visible.
  //  - `onTransaction` so we re-evaluate the trigger after every edit; we
  //    return null (no rewrite) and only use it as a notification hook.
  const unregister = api.editor.registerPlugin({
    name: 'slash-commands',

    suggestions: async (_state, t) => {
      const tg = t as { kind?: string; query?: string } | undefined;
      if (!tg || tg.kind !== 'slash') return [];
      const q = String(tg.query ?? '');
      return filterCommands(q).map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        kind: 'command',
        insert: resolveInsert(cmd).replace('$cursor', ''),
      }));
    },

    onTransaction: (_tr, state) => {
      // Re-evaluate trigger on every transaction. We must defer to a
      // microtask because the state passed here is pre-application of the
      // dispatching transaction in some host versions; reading via
      // getActiveState in a microtask is the safe path.
      queueMicrotask(() => {
        const live = api.editor.getActiveState() ?? state;
        const t = detectTrigger(live);
        if (!t) {
          if (model.visible) hide();
          return;
        }
        if (!model.visible) show(t);
        else update(t);
      });
      return null;
    },

    onKeyDown: (e, state): KeyDownResult => {
      // If the menu isn't open we don't intercept anything. The slash
      // character itself flows through normally; we react in onTransaction
      // once it has landed in the document.
      if (!model.visible) return null;

      if (e.key === 'Escape') {
        hide();
        return 'prevent-default';
      }
      if (e.key === 'ArrowDown') {
        const matches = filterCommands(model.query);
        if (matches.length > 0) {
          model = { ...model, activeIndex: (model.activeIndex + 1) % matches.length };
          render();
        }
        return 'prevent-default';
      }
      if (e.key === 'ArrowUp') {
        const matches = filterCommands(model.query);
        if (matches.length > 0) {
          const len = matches.length;
          model = { ...model, activeIndex: (model.activeIndex - 1 + len) % len };
          render();
        }
        return 'prevent-default';
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const matches = filterCommands(model.query);
        const cmd = matches[model.activeIndex];
        if (cmd) {
          // We need to apply through the editor dispatch, not from inside
          // the onKeyDown return: apply() builds and dispatches the right
          // replace transaction synchronously, so just consume the event.
          apply(cmd);
          return 'prevent-default';
        }
        // No match — close menu and let Enter through.
        hide();
        return null;
      }
      // Any other key: let the editor process it normally. The resulting
      // transaction will fire onTransaction, which will refresh / hide the
      // menu based on the updated query.
      void state;
      return null;
    },
  });

  (activate as { _cleanup?: () => void })._cleanup = () => {
    try { unregister(); } catch { /* ignore */ }
    if (reactRoot) {
      try { reactRoot.unmount(); } catch { /* ignore */ }
      reactRoot = null;
    }
    if (mountPoint) {
      mountPoint.remove();
      mountPoint = null;
    }
  };
}

export function deactivate(): void {
  const cleanup = (activate as { _cleanup?: () => void })._cleanup;
  if (cleanup) cleanup();
}
