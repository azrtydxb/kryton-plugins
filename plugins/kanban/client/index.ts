import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useRef, useEffect, useCallback } = React;

// -----------------------------------------------------------------------------
// Board model — duplicated here from ../board-model.js because the build script
// uses esbuild with `bundle: false`, so cross-file `require`s would not resolve
// at runtime in the browser. The standalone CJS copy at ../board-model.js
// exists for vitest unit tests; keep the two in sync.
// -----------------------------------------------------------------------------

interface Card {
  id: string | null;
  text: string;
  done: boolean;
}
interface Column {
  title: string;
  cards: Card[];
}
interface Board {
  columns: Column[];
}

function parseBoard(md: string): Board {
  const lines = String(md ?? '').split('\n');
  const columns: Column[] = [];
  let cur: Column | null = null;
  for (const raw of lines) {
    const head = /^##\s+(.+?)\s*$/.exec(raw);
    if (head) {
      cur = { title: head[1], cards: [] };
      columns.push(cur);
      continue;
    }
    const card = /^\s*-\s+(?:\[(?<box>[ xX])\]\s+)?(?:\[#(?<id>[a-z0-9]+)\]\s+)?(?<text>.+?)\s*$/.exec(raw);
    if (card && cur && card.groups) {
      cur.cards.push({
        id: card.groups.id || null,
        text: card.groups.text,
        done: (card.groups.box || '').toLowerCase() === 'x',
      });
    }
  }
  return { columns };
}

function serializeBoard(board: Board): string {
  const out: string[] = [];
  for (const col of board.columns || []) {
    out.push('## ' + col.title);
    for (const card of col.cards || []) {
      const box = card.done ? '[x] ' : '';
      const id = card.id ? '[#' + card.id + '] ' : '';
      out.push('- ' + box + id + card.text);
    }
  }
  return out.join('\n');
}

let _idCounter = 0;
function genId(): string {
  _idCounter++;
  return Date.now().toString(36) + _idCounter.toString(36);
}

function replaceFenceInRaw(rawContent: string, originalSource: string | null, newBody: string): string | null {
  const fence = '```kanban\n' + newBody + '\n```';
  if (originalSource) {
    const idx = rawContent.indexOf(originalSource);
    if (idx !== -1 && rawContent.indexOf(originalSource, idx + 1) === -1) {
      return rawContent.slice(0, idx) + fence + rawContent.slice(idx + originalSource.length);
    }
  }
  const re = /```kanban\n[\s\S]*?\n```/;
  if (re.test(rawContent)) {
    return rawContent.replace(re, fence);
  }
  return null;
}

// -----------------------------------------------------------------------------
// SortableJS loader (CDN, lazy)
// -----------------------------------------------------------------------------

let _SortablePromise: Promise<any> | null = null;
function loadSortable(): Promise<any> {
  if (_SortablePromise) return _SortablePromise;
  // Dynamic CDN import — TypeScript can't resolve the URL, hence the cast.
  const dynImport = (new Function('u', 'return import(u)')) as (u: string) => Promise<any>;
  _SortablePromise = dynImport('https://esm.sh/sortablejs@1.15.2')
    .then((mod: any) => mod.default || mod);
  return _SortablePromise;
}

// -----------------------------------------------------------------------------
// React board component
// -----------------------------------------------------------------------------

interface BoardProps {
  initial: string;
  onChange: (next: string) => void;
  /**
   * When false, the board renders read-only — no Add card / Add column /
   * delete / drag controls, plain text for card titles, no interactive
   * checkboxes. Pure-Preview mode passes this as false; Edit/Split keep
   * it true so authoring still works.
   */
  interactive?: boolean;
}

function KanbanBoard({ initial, onChange, interactive = true }: BoardProps): any {
  const [board, setBoard] = useState<Board>(() => parseBoard(initial));
  const boardRef = useRef<Board>(board);
  boardRef.current = board;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<any>(null);

  const commit = useCallback((next: Board) => {
    setBoard(next);
    boardRef.current = next;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(serializeBoard(next));
    }, 300);
  }, [onChange]);

  // Wire SortableJS up to each column's card list.
  useEffect(() => {
    if (!containerRef.current) return;
    const sortables: any[] = [];
    let cancelled = false;
    loadSortable().then((SortableLib: any) => {
      if (cancelled || !containerRef.current) return;
      const cols = containerRef.current.querySelectorAll('[data-column-idx]');
      cols.forEach((el: Element) => {
        sortables.push(new SortableLib(el, {
          group: 'kanban-cards',
          animation: 150,
          onEnd: (evt: any) => {
            const cur = boardRef.current;
            const next: Board = JSON.parse(JSON.stringify(cur));
            const from = Number((evt.from as HTMLElement).dataset.columnIdx);
            const to = Number((evt.to as HTMLElement).dataset.columnIdx);
            if (Number.isNaN(from) || Number.isNaN(to)) return;
            const [card] = next.columns[from].cards.splice(evt.oldIndex, 1);
            if (!card) return;
            next.columns[to].cards.splice(evt.newIndex, 0, card);
            commit(next);
          },
        }));
      });
    }).catch(() => { /* CDN load failure — drag/drop simply won't activate */ });
    return () => {
      cancelled = true;
      sortables.forEach(s => { try { s.destroy(); } catch { /* noop */ } });
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [board.columns.length, commit]);

  function addCard(colIdx: number) {
    const next: Board = JSON.parse(JSON.stringify(boardRef.current));
    next.columns[colIdx].cards.push({ id: genId(), text: 'New card', done: false });
    commit(next);
  }
  function addColumn() {
    const cur = boardRef.current;
    commit({ columns: [...cur.columns, { title: 'New Column', cards: [] }] });
  }
  function deleteCard(colIdx: number, cardIdx: number) {
    const next: Board = JSON.parse(JSON.stringify(boardRef.current));
    next.columns[colIdx].cards.splice(cardIdx, 1);
    commit(next);
  }
  function editCardText(colIdx: number, cardIdx: number, text: string) {
    const next: Board = JSON.parse(JSON.stringify(boardRef.current));
    const card = next.columns[colIdx].cards[cardIdx];
    card.text = text;
    if (!card.id) card.id = genId();
    commit(next);
  }
  function toggleCardDone(colIdx: number, cardIdx: number) {
    const next: Board = JSON.parse(JSON.stringify(boardRef.current));
    const card = next.columns[colIdx].cards[cardIdx];
    card.done = !card.done;
    if (!card.id) card.id = genId();
    commit(next);
  }
  function editColumnTitle(colIdx: number, title: string) {
    const next: Board = JSON.parse(JSON.stringify(boardRef.current));
    next.columns[colIdx].title = title;
    commit(next);
  }
  function deleteColumn(colIdx: number) {
    const next: Board = JSON.parse(JSON.stringify(boardRef.current));
    next.columns.splice(colIdx, 1);
    commit(next);
  }

  return h('div', {
    className: 'kanban-board',
    ref: containerRef,
    style: {
      display: 'flex',
      gap: '12px',
      padding: '12px',
      background: 'var(--bg)',
      borderRadius: '8px',
      border: '1px solid var(--line-strong)',
      overflowX: 'auto',
      alignItems: 'flex-start',
    },
  },
    ...board.columns.map((col: Column, ci: number) =>
      h('div', {
        key: 'col-' + ci,
        className: 'kanban-col',
        style: {
          minWidth: '220px',
          maxWidth: '260px',
          flex: '0 0 auto',
          background: 'var(--bg-1)',
          padding: '8px',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          interactive
            ? h('input', {
                value: col.title,
                onChange: (e: any) => editColumnTitle(ci, e.target.value),
                style: {
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg)',
                  fontWeight: 600,
                  fontSize: '13px',
                  outline: 'none',
                },
              })
            : h('div', {
                style: {
                  flex: 1,
                  color: 'var(--fg)',
                  fontWeight: 600,
                  fontSize: '13px',
                },
              }, col.title),
          h('span', {
            style: {
              fontSize: '11px',
              color: 'var(--fg-3)',
              background: 'var(--bg)',
              padding: '1px 6px',
              borderRadius: '10px',
            },
          }, String(col.cards.length)),
          interactive
            ? h('button', {
                onClick: () => deleteColumn(ci),
                title: 'Delete column',
                style: {
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg-4)',
                  cursor: 'pointer',
                  fontSize: '14px',
                },
              }, '×')
            : null,
        ),
        h('div', {
          'data-column-idx': ci,
          style: { minHeight: '40px', display: 'flex', flexDirection: 'column', gap: '6px' },
        },
          ...col.cards.map((card: Card, idx: number) =>
            h('div', {
              key: card.id || ('card-' + idx),
              className: 'kanban-card',
              style: {
                background: 'var(--bg-2)',
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid var(--line)',
                cursor: interactive ? 'grab' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              },
            },
              h('input', {
                type: 'checkbox',
                checked: card.done,
                onChange: () => toggleCardDone(ci, idx),
                disabled: !interactive,
                style: interactive ? undefined : { cursor: 'default' },
              }),
              interactive
                ? h('input', {
                    value: card.text,
                    onChange: (e: any) => editCardText(ci, idx, e.target.value),
                    style: {
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: card.done ? 'var(--fg-4)' : 'var(--fg)',
                      textDecoration: card.done ? 'line-through' : 'none',
                      fontSize: '13px',
                      outline: 'none',
                    },
                  })
                : h('span', {
                    style: {
                      flex: 1,
                      color: card.done ? 'var(--fg-4)' : 'var(--fg)',
                      textDecoration: card.done ? 'line-through' : 'none',
                      fontSize: '13px',
                    },
                  }, card.text),
              interactive
                ? h('button', {
                    onClick: () => deleteCard(ci, idx),
                    style: {
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--fg-4)',
                      cursor: 'pointer',
                      fontSize: '12px',
                    },
                  }, '×')
                : null,
            )
          )
        ),
        interactive
          ? h('button', {
              onClick: () => addCard(ci),
              style: {
                background: 'var(--line)',
                color: 'var(--fg)',
                border: 'none',
                padding: '6px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              },
            }, '+ Add card')
          : null,
      )
    ),
    interactive
      ? h('button', {
          key: 'add-col',
          onClick: addColumn,
          style: {
            minWidth: '140px',
            background: 'var(--bg-1)',
            color: 'var(--fg)',
            border: '1px dashed var(--line-strong)',
            padding: '8px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            alignSelf: 'flex-start',
          },
        }, '+ Add column')
      : null,
  );
}

// -----------------------------------------------------------------------------
// Plugin activation
// -----------------------------------------------------------------------------

interface FenceRendererProps {
  content: string;
  notePath: string;
  range?: { startLine: number; endLine: number };
  source?: string;
  /** False in pure Preview mode; gate editable controls on this. */
  interactive?: boolean;
}

export function activate(api: ClientPluginAPI): void {
  // Round-trip strategy: although the host now exposes
  // `api.notes.replaceFenceAtRange`, its `range` parameter expects raw-file
  // line numbers, while the `range` we receive here is relative to the parsed
  // markdown *body* (post frontmatter strip + wikilink/embed substitution).
  // Re-deriving raw-file lines is fragile, so we use a locate-and-replace
  // pattern: read the raw note, find the original fence `source` string, and
  // splice in the new body. Falls back to "first ```kanban fence" if the
  // source has been mutated externally.
  function KanbanFenceRenderer(props: FenceRendererProps): any {
    const { content, notePath, source, interactive } = props;
    const onChange = (next: string) => {
      api.notes.get(notePath).then((file: any) => {
        const raw = typeof file === 'string' ? file : (file && file.content) || '';
        const updated = replaceFenceInRaw(raw, source || null, next);
        if (updated === null) {
          api.notify.error('Kanban save failed: could not locate fence in note');
          return;
        }
        return api.notes.update(notePath, updated);
      }).catch((e: any) => {
        api.notify.error('Kanban save failed: ' + (e && e.message ? e.message : String(e)));
      });
    };
    return h(KanbanBoard, {
      initial: content,
      onChange,
      // Default interactive=false here so the safer read-only path
      // applies if the host doesn't yet forward the flag.
      interactive: interactive === true,
    });
  }
  api.markdown.registerCodeFenceRenderer('kanban', KanbanFenceRenderer);
}

export function deactivate(): void {
  // Cleanup is handled by the plugin system
}
