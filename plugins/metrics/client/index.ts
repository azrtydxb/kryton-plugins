import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;

interface DailyCount {
  date: string;
  count: number;
}

interface StatsPayload {
  totalNotes: number;
  totalWords: number;
  averageLength: number;
  notesPerDay: DailyCount[];
  topTags: Array<{ tag: string; count: number }>;
  totalLinks: number;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Helper: format large numbers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Big stat number card
// ---------------------------------------------------------------------------

function StatCard(props: { value: string; label: string; color?: string }): any {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '10px 8px',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.04)',
      flex: 1,
      minWidth: 0,
    },
  },
    h('span', {
      style: {
        fontSize: '22px',
        fontWeight: '700',
        color: props.color ?? '#a78bfa',
        lineHeight: '1.2',
      },
    }, props.value),
    h('span', {
      style: {
        fontSize: '10px',
        color: 'var(--color-muted, #888)',
        marginTop: '3px',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      },
    }, props.label)
  );
}

// ---------------------------------------------------------------------------
// Mini sparkline bar chart for notes per day
// ---------------------------------------------------------------------------

function MiniBarChart(props: { data: DailyCount[] }): any {
  const { data } = props;
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.count), 1);

  return h('div', {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '1px',
      height: '32px',
      padding: '0 2px',
    },
  },
    data.map((d) =>
      h('div', {
        key: d.date,
        title: `${d.date}: ${d.count} note${d.count !== 1 ? 's' : ''}`,
        style: {
          flex: 1,
          height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 2)}%`,
          background: d.count > 0 ? '#7c3aed' : 'rgba(255,255,255,0.06)',
          borderRadius: '1px',
          minHeight: '2px',
          transition: 'height 0.3s',
        },
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Panel factory
// ---------------------------------------------------------------------------

function createMetricsPanel(api: ClientPluginAPI): () => any {
  function MetricsPanel(): any {
    const [stats, setStats] = useState<StatsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cached, setCached] = useState(false);

    const fetchStats = useCallback(async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const url = forceRefresh ? '/stats?refresh=true' : '/stats';
        const resp = await api.api.fetch(url);
        if (resp.ok) {
          const data = await resp.json() as { stats: StatsPayload; cached: boolean };
          setStats(data.stats);
          setCached(data.cached);
        } else {
          setError('Failed to load stats');
        }
      } catch {
        setError('Failed to load stats');
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      fetchStats();
    }, [fetchStats]);

    function handleRefresh(): void {
      fetchStats(true);
    }

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
      h('span', null, 'WRITING METRICS'),
    );

    // --- Loading state ---
    if (loading) {
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      },
        sectionHeader,
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            fontSize: '12px',
            color: 'var(--color-muted, #888)',
          },
        }, 'Computing stats\u2026'),
      );
    }

    // --- Error state ---
    if (error || !stats) {
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      },
        sectionHeader,
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: '8px',
            fontSize: '12px',
            color: 'var(--color-muted, #888)',
          },
        },
          h('span', null, error ?? 'No data'),
          h('button', {
            onClick: handleRefresh,
            style: {
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid var(--color-border, #3f3f5a)',
              background: 'transparent',
              color: '#a78bfa',
              cursor: 'pointer',
              fontSize: '12px',
            },
          }, 'Try again')
        ),
      );
    }

    // --- Dashboard ---
    const computedDate = stats.computedAt
      ? new Date(stats.computedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
      },
    },
      sectionHeader,
      // Header row with refresh button
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px 4px',
        },
      },
        h('span', {
          style: { fontSize: '10px', color: 'var(--color-muted, #888)' },
        }, cached ? `Cached \u00B7 ${computedDate}` : `Updated ${computedDate}`),
        h('button', {
          onClick: handleRefresh,
          title: 'Recalculate stats',
          style: {
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#a78bfa',
            fontSize: '13px',
            padding: '2px 4px',
          },
        }, '\u21BB Refresh')
      ),

      // Big number cards
      h('div', {
        style: {
          display: 'flex',
          gap: '6px',
          padding: '6px 10px',
        },
      },
        h(StatCard, { value: formatNumber(stats.totalNotes), label: 'Notes' }),
        h(StatCard, { value: formatNumber(stats.totalWords), label: 'Words', color: '#34d399' }),
        h(StatCard, { value: formatNumber(stats.averageLength), label: 'Avg words', color: '#60a5fa' })
      ),

      // Links count
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          padding: '4px 10px',
          fontSize: '12px',
          color: 'var(--color-muted, #888)',
          gap: '6px',
        },
      },
        h('span', null, '\uD83D\uDD17'),
        h('span', null, `${formatNumber(stats.totalLinks)} link${stats.totalLinks !== 1 ? 's' : ''} across notes`)
      ),

      // Sparkline: notes per day
      h('div', {
        style: {
          padding: '8px 10px 4px',
          borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
        },
      },
        h('div', {
          style: { fontSize: '10px', color: 'var(--color-muted, #888)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
        }, 'Notes per day (last 30 days)'),
        h(MiniBarChart, { data: stats.notesPerDay })
      ),

      // Top tags
      stats.topTags.length > 0
        ? h('div', {
            style: {
              padding: '8px 10px',
              borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
            },
          },
            h('div', {
              style: { fontSize: '10px', color: 'var(--color-muted, #888)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
            }, 'Top Tags'),
            h('ul', {
              style: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '3px' },
            },
              stats.topTags.map((t: any) => {
                const maxCount = stats.topTags[0]?.count ?? 1;
                const pct = Math.round((t.count / maxCount) * 100);
                return h('li', {
                  key: t.tag,
                  style: { display: 'flex', alignItems: 'center', gap: '6px' },
                },
                  h('span', {
                    style: { fontSize: '11px', color: '#a78bfa', width: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 },
                  }, `#${t.tag}`),
                  h('div', {
                    style: { flex: 1, height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' },
                  },
                    h('div', {
                      style: { width: `${pct}%`, height: '100%', background: '#7c3aed', borderRadius: '2px' },
                    })
                  ),
                  h('span', {
                    style: { fontSize: '10px', color: 'var(--color-muted, #888)', width: '24px', textAlign: 'right', flexShrink: 0 },
                  }, String(t.count))
                );
              })
            )
          )
        : null
    );
  }

  return MetricsPanel;
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  const MetricsPanel = createMetricsPanel(api);

  api.ui.registerSidebarPanel(MetricsPanel, {
    id: 'metrics',
    title: 'Metrics',
    icon: 'bar-chart-2',
    order: 50,
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
