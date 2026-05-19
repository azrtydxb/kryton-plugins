import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;

interface ReadingItem {
  id: string;
  url: string;
  title: string;
  notes: string;
  read: boolean;
  createdAt: string;
}

type FilterMode = 'all' | 'unread' | 'read';

// ---------------------------------------------------------------------------
// Reading List panel component
// ---------------------------------------------------------------------------

// Factory pattern: the component needs `api` in closure scope.
function createReadingListPanel(api: ClientPluginAPI): () => any {
  function ReadingList(): any {
    const [items, setItems] = useState<ReadingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [addUrl, setAddUrl] = useState('');
    const [addTitle, setAddTitle] = useState('');
    const [adding, setAdding] = useState(false);
    const [filter, setFilter] = useState<FilterMode>('all');

    const fetchItems = useCallback(async () => {
      setLoading(true);
      try {
        const resp = await api.api.fetch('/items');
        if (resp.ok) {
          const data = await resp.json() as { items: ReadingItem[] };
          setItems(data.items);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      fetchItems();
    }, [fetchItems]);

    async function handleAdd(): Promise<void> {
      const url = addUrl.trim();
      if (!url) return;
      setAdding(true);
      try {
        const resp = await api.api.fetch('/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, title: addTitle.trim() || url }),
        });
        if (resp.ok) {
          const data = await resp.json() as { item: ReadingItem };
          setItems((prev: any) => [data.item, ...prev]);
          setAddUrl('');
          setAddTitle('');
        } else {
          api.notify.error('Failed to add URL');
        }
      } catch {
        api.notify.error('Failed to add URL');
      } finally {
        setAdding(false);
      }
    }

    async function toggleRead(item: ReadingItem): Promise<void> {
      try {
        const resp = await api.api.fetch(`/items/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: !item.read }),
        });
        if (resp.ok) {
          const data = await resp.json() as { item: ReadingItem };
          setItems((prev: any) => prev.map((i: any) => (i.id === item.id ? data.item : i)));
        }
      } catch {
        api.notify.error('Failed to update item');
      }
    }

    async function deleteItem(id: string): Promise<void> {
      try {
        const resp = await api.api.fetch(`/items/${id}`, { method: 'DELETE' });
        if (resp.ok) {
          setItems((prev: any) => prev.filter((i: any) => i.id !== id));
        } else {
          api.notify.error('Failed to delete item');
        }
      } catch {
        api.notify.error('Failed to delete item');
      }
    }

    const filtered = items.filter((item: any) => {
      if (filter === 'unread') return !item.read;
      if (filter === 'read') return item.read;
      return true;
    });

    // Styles
    const filterBtnStyle = (active: boolean) => ({
      padding: '2px 8px',
      fontSize: '11px',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      background: active ? 'rgba(139,92,246,0.25)' : 'transparent',
      color: active ? '#a78bfa' : 'var(--color-muted, #888)',
      fontWeight: active ? '600' : '400',
    });

    const sectionHeader = h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10.5,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: 'var(--fg-3)',
      },
    },
      h('span', null, 'READING LIST'),
      h('span', { style: { color: 'var(--fg-4)' } }, String(items.length)),
    );

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },

      sectionHeader,

      // Add URL section
      h('div', {
        style: {
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-border, #3f3f5a)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        },
      },
        h('input', {
          type: 'url',
          value: addUrl,
          onChange: (e: any) => setAddUrl(e.target.value),
          onKeyDown: (e: any) => { if (e.key === 'Enter') handleAdd(); },
          placeholder: 'Paste URL...',
          style: {
            width: '100%',
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            border: '1px solid var(--color-border, #3f3f5a)',
            background: 'var(--color-input-bg, #2a2a3e)',
            color: 'var(--color-text, #e0e0e0)',
            boxSizing: 'border-box',
          },
        }),
        h('div', { style: { display: 'flex', gap: '4px' } },
          h('input', {
            type: 'text',
            value: addTitle,
            onChange: (e: any) => setAddTitle(e.target.value),
            placeholder: 'Title (optional)',
            style: {
              flex: 1,
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid var(--color-border, #3f3f5a)',
              background: 'var(--color-input-bg, #2a2a3e)',
              color: 'var(--color-text, #e0e0e0)',
            },
          }),
          h('button', {
            onClick: handleAdd,
            disabled: adding || !addUrl.trim(),
            style: {
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              background: '#7c3aed',
              color: '#fff',
              cursor: adding || !addUrl.trim() ? 'not-allowed' : 'pointer',
              opacity: adding || !addUrl.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            },
          }, adding ? '...' : 'Add')
        )
      ),

      // Filter tabs
      h('div', {
        style: {
          display: 'flex',
          gap: '4px',
          padding: '6px 10px',
          borderBottom: '1px solid var(--color-border, #3f3f5a)',
        },
      },
        h('button', { onClick: () => setFilter('all'), style: filterBtnStyle(filter === 'all') }, 'All'),
        h('button', { onClick: () => setFilter('unread'), style: filterBtnStyle(filter === 'unread') }, 'Unread'),
        h('button', { onClick: () => setFilter('read'), style: filterBtnStyle(filter === 'read') }, 'Read'),
        h('span', { style: { flex: 1 } }),
        h('button', {
          onClick: fetchItems,
          style: { ...filterBtnStyle(false), fontSize: '10px' },
          title: 'Refresh',
        }, '\u21BB')
      ),

      // List
      loading
        ? h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              fontSize: '12px',
              color: 'var(--color-muted, #888)',
            },
          }, 'Loading...')
        : filtered.length === 0
        ? h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              fontSize: '12px',
              color: 'var(--color-muted, #888)',
              padding: '16px',
              textAlign: 'center',
            },
          },
            filter === 'all' ? 'No saved URLs yet.' : `No ${filter} items.`
          )
        : h('ul', {
            style: {
              flex: 1,
              overflowY: 'auto',
              margin: 0,
              padding: 0,
              listStyle: 'none',
            },
          },
            filtered.map((item: any) =>
              h('li', {
                key: item.id,
                style: {
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
                  opacity: item.read ? 0.6 : 1,
                },
              },
                // Read checkbox
                h('input', {
                  type: 'checkbox',
                  checked: item.read,
                  onChange: () => toggleRead(item),
                  style: { marginTop: '2px', cursor: 'pointer', flexShrink: 0 },
                  title: item.read ? 'Mark as unread' : 'Mark as read',
                }),

                // Title / URL (clickable)
                h('div', {
                  style: { flex: 1, minWidth: 0 },
                },
                  h('a', {
                    href: item.url,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    style: {
                      fontSize: '12px',
                      color: item.read ? 'var(--color-muted, #888)' : 'var(--color-accent, #a78bfa)',
                      textDecoration: item.read ? 'line-through' : 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                    title: item.url,
                  }, item.title || item.url),
                  item.notes
                    ? h('span', {
                        style: {
                          fontSize: '11px',
                          color: 'var(--color-muted, #888)',
                          display: 'block',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      }, item.notes)
                    : null
                ),

                // Delete button
                h('button', {
                  onClick: () => deleteItem(item.id),
                  title: 'Remove from list',
                  style: {
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-muted, #888)',
                    fontSize: '14px',
                    lineHeight: '1',
                    padding: '0 2px',
                    flexShrink: 0,
                  },
                  onMouseEnter: (e: any) => { e.target.style.color = '#ef4444'; },
                  onMouseLeave: (e: any) => { e.target.style.color = 'var(--color-muted, #888)'; },
                }, '\u00D7')
              )
            )
          )
    );
  }

  return ReadingList;
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  const ReadingListPanel = createReadingListPanel(api);

  api.ui.registerSidebarPanel(ReadingListPanel, {
    id: 'reading-list',
    title: 'Reading List',
    icon: 'bookmark',
    order: 40,
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
