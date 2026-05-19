import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect } = React;

// ---------------------------------------------------------------------------
// Slash command definitions
// ---------------------------------------------------------------------------

interface SlashCommand {
  trigger: string;       // e.g. "h1"
  label: string;         // display label
  description: string;
  insert: (trigger: string) => { text: string; cursorOffset?: number };
}

function todayISO(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    trigger: 'h1',
    label: 'Heading 1',
    description: 'Large heading',
    insert: () => ({ text: '# ' }),
  },
  {
    trigger: 'h2',
    label: 'Heading 2',
    description: 'Medium heading',
    insert: () => ({ text: '## ' }),
  },
  {
    trigger: 'h3',
    label: 'Heading 3',
    description: 'Small heading',
    insert: () => ({ text: '### ' }),
  },
  {
    trigger: 'bold',
    label: 'Bold',
    description: 'Bold text',
    insert: () => ({ text: '****', cursorOffset: -2 }),
  },
  {
    trigger: 'italic',
    label: 'Italic',
    description: 'Italic text',
    insert: () => ({ text: '**', cursorOffset: -1 }),
  },
  {
    trigger: 'code',
    label: 'Code Block',
    description: 'Fenced code block',
    insert: () => ({ text: '```\n\n```', cursorOffset: -4 }),
  },
  {
    trigger: 'table',
    label: 'Table',
    description: '2x2 table template',
    insert: () => ({
      text: '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n| Cell 3   | Cell 4   |',
    }),
  },
  {
    trigger: 'date',
    label: 'Date',
    description: 'Insert today\'s date (YYYY-MM-DD)',
    insert: () => ({ text: todayISO() }),
  },
  {
    trigger: 'time',
    label: 'Time',
    description: 'Insert current time (HH:MM)',
    insert: () => ({ text: nowHHMM() }),
  },
  {
    trigger: 'todo',
    label: 'Todo Item',
    description: 'Task list item',
    insert: () => ({ text: '- [ ] ' }),
  },
  {
    trigger: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    insert: () => ({ text: '---' }),
  },
];

// ---------------------------------------------------------------------------
// Floating menu component
// ---------------------------------------------------------------------------

interface MenuProps {
  commands: SlashCommand[];
  query: string;
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
  position: { top: number; left: number };
}

function SlashMenu(props: MenuProps): any {
  const { commands, query, onSelect, onDismiss, position } = props;
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = commands.filter((c) =>
    c.trigger.startsWith(query.toLowerCase()) || c.label.toLowerCase().includes(query.toLowerCase())
  );

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keyboard handler
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i: number) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i: number) => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIndex]) onSelect(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    }
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [filtered, activeIndex, onSelect, onDismiss]);

  if (filtered.length === 0) {
    return h('div', {
      style: {
        position: 'fixed',
        top: position.top,
        left: position.left,
        background: 'var(--color-surface, #1e1e2e)',
        border: '1px solid var(--color-border, #3f3f5a)',
        borderRadius: '8px',
        padding: '8px',
        zIndex: 9999,
        fontSize: '13px',
        color: 'var(--color-muted, #888)',
        minWidth: '200px',
      },
    }, 'No matching commands');
  }

  return h('div', {
    style: {
      position: 'fixed',
      top: position.top,
      left: position.left,
      background: 'var(--color-surface, #1e1e2e)',
      border: '1px solid var(--color-border, #3f3f5a)',
      borderRadius: '8px',
      padding: '4px',
      zIndex: 9999,
      minWidth: '220px',
      maxHeight: '280px',
      overflowY: 'auto',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    },
  },
    filtered.map((cmd, i) =>
      h('div', {
        key: cmd.trigger,
        onClick: () => onSelect(cmd),
        style: {
          display: 'flex',
          flexDirection: 'column',
          padding: '6px 10px',
          borderRadius: '4px',
          cursor: 'pointer',
          background: i === activeIndex ? 'var(--color-accent-muted, rgba(139,92,246,0.2))' : 'transparent',
        },
        onMouseEnter: () => setActiveIndex(i),
      },
        h('span', {
          style: {
            fontSize: '13px',
            fontWeight: '500',
            color: 'var(--color-text, #e0e0e0)',
          },
        }, cmd.label),
        h('span', {
          style: {
            fontSize: '11px',
            color: 'var(--color-muted, #888)',
            marginTop: '1px',
          },
        }, cmd.description)
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

interface MenuState {
  visible: boolean;
  query: string;
  position: { top: number; left: number };
  triggerFrom: number;  // document position where slash was typed
}

// ---------------------------------------------------------------------------
// Plugin activation
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  // We build a CodeMirror ViewPlugin that intercepts input to detect /
  // at the start of a line and manages a React-rendered floating menu.

  let mountPoint: HTMLDivElement | null = null;
  let menuState: MenuState = { visible: false, query: '', position: { top: 0, left: 0 }, triggerFrom: -1 };
  let currentView: any = null;

  function renderMenu(): void {
    if (!mountPoint) return;
    if (!menuState.visible) {
      // Use React 18 createRoot if available, else fallback
      const ReactDOM = (window as any).__krytonPluginDeps?.ReactDOM;
      if (ReactDOM?.createRoot) {
        // We'll just unmount by rendering null
      }
      mountPoint.innerHTML = '';
      return;
    }

    const el = h(SlashMenu, {
      commands: SLASH_COMMANDS,
      query: menuState.query,
      onSelect: (cmd: SlashCommand) => {
        applyCommand(cmd);
      },
      onDismiss: () => {
        hideMenu();
      },
      position: menuState.position,
    });

    // Use simple innerHTML approach via createRoot or legacy render
    const ReactDOM = (window as any).__krytonPluginDeps?.ReactDOM;
    if (ReactDOM) {
      if (ReactDOM.createRoot) {
        if (!(mountPoint as any)._root) {
          (mountPoint as any)._root = ReactDOM.createRoot(mountPoint);
        }
        (mountPoint as any)._root.render(el);
      } else {
        ReactDOM.render(el, mountPoint);
      }
    }
  }

  function showMenu(view: any, from: number, query: string): void {
    currentView = view;

    // Compute cursor coordinates from CodeMirror
    let top = 200;
    let left = 200;
    try {
      const coords = view.coordsAtPos(from);
      if (coords) {
        top = coords.bottom + 4;
        left = coords.left;
      }
    } catch {
      // ignore
    }

    menuState = { visible: true, query, position: { top, left }, triggerFrom: from };
    renderMenu();
  }

  function updateMenu(view: any, from: number, query: string): void {
    currentView = view;
    let top = menuState.position.top;
    let left = menuState.position.left;
    try {
      const coords = view.coordsAtPos(from);
      if (coords) {
        top = coords.bottom + 4;
        left = coords.left;
      }
    } catch {
      // ignore
    }
    menuState = { ...menuState, query, position: { top, left }, triggerFrom: from };
    renderMenu();
  }

  function hideMenu(): void {
    menuState = { visible: false, query: '', position: { top: 0, left: 0 }, triggerFrom: -1 };
    renderMenu();
  }

  function applyCommand(cmd: SlashCommand): void {
    if (!currentView) {
      hideMenu();
      return;
    }
    const view = currentView;
    const triggerFrom = menuState.triggerFrom;
    hideMenu();

    // Delete from triggerFrom (the slash position) to current cursor
    const cursorHead = view.state.selection.main.head;
    const { text, cursorOffset = 0 } = cmd.insert(cmd.trigger);

    view.dispatch({
      changes: { from: triggerFrom, to: cursorHead, insert: text },
      selection: { anchor: triggerFrom + text.length + cursorOffset },
    });
    view.focus();
  }

  // Build a CodeMirror extension using the EventDispatcher approach
  // We create a simple extension that hooks into editor DOM events
  const slashExtension = buildSlashExtension(
    showMenu,
    updateMenu,
    hideMenu,
    () => menuState,
  );

  api.editor.registerExtension(slashExtension);

  // Mount point for the floating menu
  mountPoint = document.createElement('div');
  mountPoint.id = 'slash-commands-menu-root';
  document.body.appendChild(mountPoint);

  (activate as any)._cleanup = () => {
    if (mountPoint) {
      const ReactDOM = (window as any).__krytonPluginDeps?.ReactDOM;
      if (ReactDOM) {
        if ((mountPoint as any)._root) {
          (mountPoint as any)._root.unmount();
        } else if (ReactDOM.unmountComponentAtNode) {
          ReactDOM.unmountComponentAtNode(mountPoint);
        }
      }
      mountPoint.remove();
      mountPoint = null;
    }
  };
}

function buildSlashExtension(
  showMenu: (view: any, from: number, query: string) => void,
  updateMenu: (view: any, from: number, query: string) => void,
  hideMenu: () => void,
  getMenuState: () => MenuState,
): any {
  // Return a CodeMirror 6 Extension — specifically a ViewPlugin
  // We access the CodeMirror API through the global if available,
  // otherwise we build a lightweight DOM-event-based fallback.
  const CM = (window as any).__krytonPluginDeps?.CM6;

  if (CM?.ViewPlugin) {
    return CM.ViewPlugin.fromClass(
      class {
        constructor(_view: any) {}
        update(update: any): void {
          if (!update.docChanged && !update.selectionSet) return;
          const view = update.view;
          const state = view.state;
          const head = state.selection.main.head;
          const line = state.doc.lineAt(head);
          const lineText = line.text;
          const colInLine = head - line.from;
          const textBeforeCursor = lineText.slice(0, colInLine);

          // Check if there's a slash at or before cursor on the same line
          const slashIdx = textBeforeCursor.lastIndexOf('/');
          if (slashIdx === -1) {
            if (getMenuState().visible) hideMenu();
            return;
          }

          // Only trigger if the slash is at start of line (possibly with whitespace)
          const beforeSlash = textBeforeCursor.slice(0, slashIdx).trim();
          if (beforeSlash !== '') {
            if (getMenuState().visible) hideMenu();
            return;
          }

          const query = textBeforeCursor.slice(slashIdx + 1);
          const from = line.from + slashIdx;

          if (!getMenuState().visible) {
            showMenu(view, from, query);
          } else {
            updateMenu(view, from, query);
          }
        }
        destroy(): void {
          hideMenu();
        }
      }
    );
  }

  // Fallback: DOM-event-based listener attached to cm-editor
  return {
    _isFallback: true,
    _attach(view: any) {
      const dom = view.dom as HTMLElement;
      function onInput() {
        const state = view.state;
        const head = state.selection.main.head;
        const line = state.doc.lineAt(head);
        const lineText = line.text;
        const colInLine = head - line.from;
        const textBeforeCursor = lineText.slice(0, colInLine);
        const slashIdx = textBeforeCursor.lastIndexOf('/');
        if (slashIdx === -1) {
          if (getMenuState().visible) hideMenu();
          return;
        }
        const beforeSlash = textBeforeCursor.slice(0, slashIdx).trim();
        if (beforeSlash !== '') {
          if (getMenuState().visible) hideMenu();
          return;
        }
        const query = textBeforeCursor.slice(slashIdx + 1);
        const from = line.from + slashIdx;
        if (!getMenuState().visible) {
          showMenu(view, from, query);
        } else {
          updateMenu(view, from, query);
        }
      }
      dom.addEventListener('input', onInput);
      dom.addEventListener('keyup', onInput);
    },
  };
}

export function deactivate(): void {
  if ((activate as any)._cleanup) (activate as any)._cleanup();
}
