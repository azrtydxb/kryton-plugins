import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;

interface Feed {
  id: string;
  url: string;
  title: string;
  addedAt: string;
  unread?: number;
}

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function createRSSPanel(api: ClientPluginAPI): () => any {
  function RSSPanel(): any {
    const [feeds, setFeeds] = useState<Feed[]>([]);
    const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
    const [items, setItems] = useState<FeedItem[]>([]);
    const [loadingFeeds, setLoadingFeeds] = useState(true);
    const [loadingItems, setLoadingItems] = useState(false);
    const [addUrl, setAddUrl] = useState('');
    const [adding, setAdding] = useState(false);
    const [clippingItem, setClippingItem] = useState<string | null>(null); // item link being clipped

    const fetchFeeds = useCallback(async () => {
      setLoadingFeeds(true);
      try {
        const resp = await api.api.fetch('/feeds');
        if (resp.ok) {
          const data = await resp.json() as { feeds: Feed[] };
          setFeeds(data.feeds ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoadingFeeds(false);
      }
    }, []);

    useEffect(() => {
      fetchFeeds();
    }, [fetchFeeds]);

    async function fetchItems(feed: Feed): Promise<void> {
      setSelectedFeed(feed);
      setItems([]);
      setLoadingItems(true);
      try {
        const resp = await api.api.fetch(`/feeds/${feed.id}/items`);
        if (resp.ok) {
          const data = await resp.json() as { items: FeedItem[] };
          setItems(data.items ?? []);
        } else {
          api.notify.error('Failed to load feed items');
        }
      } catch {
        api.notify.error('Failed to load feed items');
      } finally {
        setLoadingItems(false);
      }
      // Mark as read on open — reset unread badge locally + server-side
      if ((feed.unread ?? 0) > 0) {
        setFeeds((prev: any) => prev.map((f: any) => f.id === feed.id ? { ...f, unread: 0 } : f));
        try { await api.api.fetch(`/feeds/${feed.id}/read`, { method: 'POST' }); } catch { /* ignore */ }
      }
    }

    async function handleAddFeed(): Promise<void> {
      const url = addUrl.trim();
      if (!url) return;
      setAdding(true);
      try {
        const resp = await api.api.fetch('/feeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (resp.ok) {
          const data = await resp.json() as { feed: Feed };
          setFeeds((prev: any) => [...prev, data.feed]);
          setAddUrl('');
          api.notify.success(`Added: ${data.feed.title}`);
        } else {
          const err = await resp.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
          api.notify.error(err.error ?? 'Failed to add feed');
        }
      } catch {
        api.notify.error('Failed to add feed');
      } finally {
        setAdding(false);
      }
    }

    async function handleRemoveFeed(feed: Feed): Promise<void> {
      try {
        const resp = await api.api.fetch(`/feeds/${feed.id}`, { method: 'DELETE' });
        if (resp.ok) {
          setFeeds((prev: any) => prev.filter((f: any) => f.id !== feed.id));
          if (selectedFeed?.id === feed.id) {
            setSelectedFeed(null);
            setItems([]);
          }
        }
      } catch {
        api.notify.error('Failed to remove feed');
      }
    }

    async function handleClip(item: FeedItem): Promise<void> {
      setClippingItem(item.link);
      try {
        const resp = await api.api.fetch('/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            url: item.link,
            content: item.description,
          }),
        });
        if (resp.ok) {
          api.notify.success('Article clipped to notes');
        } else {
          api.notify.error('Failed to clip article');
        }
      } catch {
        api.notify.error('Failed to clip article');
      } finally {
        setClippingItem(null);
      }
    }

    // Shared style pieces
    const inputStyle: any = {
      width: '100%',
      padding: '5px 8px',
      fontSize: '12px',
      borderRadius: '4px',
      border: '1px solid var(--color-border, #3f3f5a)',
      background: 'var(--color-input-bg, #2a2a3e)',
      color: 'var(--color-text, #e0e0e0)',
      boxSizing: 'border-box',
    };

    const sectionHeaderStyle: any = {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 10px',
      borderBottom: '1px solid var(--color-border, #3f3f5a)',
      fontSize: '11px', fontWeight: '600',
      color: 'var(--color-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em',
    };

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
      h('span', null, 'RSS'),
      h('span', { style: { color: 'var(--fg-4)' } }, String(feeds.length)),
    );

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },

      sectionHeader,

      // Add feed input
      h('div', { style: { padding: '8px 10px', borderBottom: '1px solid var(--color-border, #3f3f5a)', display: 'flex', gap: '6px' } },
        h('input', {
          type: 'url',
          value: addUrl,
          onChange: (e: any) => setAddUrl(e.target.value),
          onKeyDown: (e: any) => { if (e.key === 'Enter') handleAddFeed(); },
          placeholder: 'Add feed URL...',
          style: { ...inputStyle, flex: 1 },
        }),
        h('button', {
          onClick: handleAddFeed,
          disabled: adding || !addUrl.trim(),
          style: {
            padding: '4px 10px', fontSize: '12px', borderRadius: '4px',
            border: 'none', background: '#7c3aed', color: '#fff',
            cursor: adding || !addUrl.trim() ? 'not-allowed' : 'pointer',
            opacity: adding || !addUrl.trim() ? 0.6 : 1,
            whiteSpace: 'nowrap',
          },
        }, adding ? '...' : 'Add')
      ),

      // Feed list / items split
      selectedFeed
        ? // Items view
          h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' } },
            h('div', { style: sectionHeaderStyle },
              h('button', {
                onClick: () => { setSelectedFeed(null); setItems([]); },
                style: { background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontSize: '12px', padding: 0, marginRight: '6px' },
              }, '← Feeds'),
              h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, selectedFeed.title),
            ),
            loadingItems
              ? h('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '12px' } }, 'Loading...')
              : items.length === 0
              ? h('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '12px' } }, 'No items found')
              : h('ul', { style: { flex: 1, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' } },
                  items.map((item: any, idx: number) =>
                    h('li', {
                      key: `${item.link}-${idx}`,
                      style: {
                        padding: '8px 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', flexDirection: 'column', gap: '4px',
                      },
                    },
                      h('a', {
                        href: item.link,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        style: {
                          fontSize: '12px', color: '#a78bfa',
                          textDecoration: 'none', fontWeight: '500',
                          lineHeight: 1.4, display: 'block',
                        },
                      }, item.title),
                      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
                        item.pubDate
                          ? h('span', { style: { fontSize: '10px', color: 'var(--color-muted, #888)' } }, formatDate(item.pubDate))
                          : null,
                        h('button', {
                          onClick: () => handleClip(item),
                          disabled: clippingItem === item.link,
                          style: {
                            padding: '2px 8px', fontSize: '10px',
                            background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                            border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '4px', cursor: 'pointer',
                            opacity: clippingItem === item.link ? 0.6 : 1,
                          },
                        }, clippingItem === item.link ? '...' : 'Clip')
                      )
                    )
                  )
                )
          )

        : // Feed list view
          h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' } },
            h('div', { style: sectionHeaderStyle },
              h('span', null, 'Subscribed Feeds'),
              h('button', {
                onClick: fetchFeeds,
                style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted, #888)', fontSize: '14px' },
                title: 'Refresh feeds',
              }, '\u21BB')
            ),
            loadingFeeds
              ? h('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '12px' } }, 'Loading...')
              : feeds.length === 0
              ? h('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--color-muted, #888)', fontSize: '12px' } },
                  'No feeds yet. Add an RSS/Atom feed URL above.'
                )
              : h('ul', { style: { flex: 1, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' } },
                  feeds.map((feed: any) =>
                    h('li', {
                      key: feed.id,
                      style: {
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      },
                    },
                      h('button', {
                        onClick: () => fetchItems(feed),
                        style: {
                          flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', color: 'var(--color-text, #e0e0e0)',
                          fontSize: '12px', padding: '0 2px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontWeight: (feed.unread ?? 0) > 0 ? '600' : '400',
                        },
                      }, feed.title),
                      (feed.unread ?? 0) > 0
                        ? h('span', {
                            title: `${feed.unread} unread`,
                            style: {
                              minWidth: '18px',
                              padding: '1px 6px',
                              fontSize: '10px',
                              fontWeight: '600',
                              textAlign: 'center',
                              borderRadius: '9px',
                              background: '#7c3aed',
                              color: '#fff',
                              flexShrink: 0,
                            },
                          }, String(feed.unread))
                        : null,
                      h('button', {
                        onClick: (e: any) => { e.stopPropagation(); handleRemoveFeed(feed); },
                        title: 'Remove feed',
                        style: {
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--color-muted, #888)', fontSize: '14px',
                          padding: '0 2px', flexShrink: 0,
                        },
                        onMouseEnter: (e: any) => { e.target.style.color = '#ef4444'; },
                        onMouseLeave: (e: any) => { e.target.style.color = 'var(--color-muted, #888)'; },
                      }, '\u00D7')
                    )
                  )
                )
          )
    );
  }

  return RSSPanel;
}

export function activate(api: ClientPluginAPI): void {
  const RSSPanel = createRSSPanel(api);

  api.ui.registerSidebarPanel(RSSPanel, {
    id: 'rss-reader',
    title: 'RSS',
    icon: 'rss',
    order: 50,
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
