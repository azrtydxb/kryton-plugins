import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface JournalEntry {
  date: string;
  path: string;
  title: string;
  wordCount: number;
  preview: string;
}

function createJournalPanel(api: ClientPluginAPI): () => any {
  function JournalPanel(): any {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const fetchEntries = useCallback(async () => {
      setLoading(true);
      try {
        const resp = await api.api.fetch(`/entries?year=${year}&month=${month}`);
        if (resp.ok) {
          const data = await resp.json() as { entries: JournalEntry[] };
          setEntries(data.entries ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, [year, month]);

    useEffect(() => {
      fetchEntries();
    }, [fetchEntries]);

    function prevMonth(): void {
      if (month === 1) { setYear((y: number) => y - 1); setMonth(12); }
      else setMonth((m: number) => m - 1);
    }

    function nextMonth(): void {
      if (month === 12) { setYear((y: number) => y + 1); setMonth(1); }
      else setMonth((m: number) => m + 1);
    }

    async function handleNewEntry(): Promise<void> {
      setCreating(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        await api.api.fetch('/create-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today }),
        });
        // Refresh to show new entry
        await fetchEntries();
        api.notify.success('Daily note ready');
      } catch {
        api.notify.error('Failed to create entry');
      } finally {
        setCreating(false);
      }
    }

    function handleOpenEntry(entry: JournalEntry): void {
      // Use the server-side create-entry endpoint to navigate/open
      api.api.fetch('/create-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: entry.date }),
      }).catch(() => {});
    }

    // Shared style helpers
    const s = {
      container: {
        display: 'flex', flexDirection: 'column' as const,
        height: '100%', overflow: 'hidden',
      },
      header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', borderBottom: '1px solid var(--color-border, #3f3f5a)',
        gap: '6px',
      },
      navBtn: {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--color-muted, #888)', fontSize: '16px',
        padding: '2px 6px', borderRadius: '4px',
      },
      monthLabel: {
        flex: 1, textAlign: 'center' as const, fontSize: '13px',
        fontWeight: '600', color: 'var(--color-text, #e0e0e0)',
      },
      newBtn: {
        padding: '4px 10px', background: '#7c3aed', color: '#fff',
        border: 'none', borderRadius: '4px', cursor: 'pointer',
        fontSize: '11px', whiteSpace: 'nowrap' as const,
        opacity: creating ? 0.6 : 1,
      },
      list: {
        flex: 1, overflowY: 'auto' as const, padding: '6px 0',
      },
      emptyMsg: {
        padding: '20px', textAlign: 'center' as const,
        color: 'var(--color-muted, #888)', fontSize: '12px',
      },
      entryItem: {
        padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column' as const, gap: '3px',
      },
      entryDate: {
        fontSize: '11px', color: 'var(--color-muted, #888)',
      },
      entryTitle: {
        fontSize: '13px', color: 'var(--color-text, #e0e0e0)',
        fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
      },
      entryRow: {
        display: 'flex', alignItems: 'center', gap: '6px',
      },
      entryPreview: {
        fontSize: '11px', color: 'var(--color-muted, #888)',
        overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const, flex: 1,
      },
      badge: {
        fontSize: '10px', background: 'rgba(139,92,246,0.2)',
        color: '#a78bfa', padding: '1px 5px', borderRadius: '8px',
        flexShrink: 0,
      },
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
      h('span', null, 'JOURNAL'),
      h('span', { style: { color: 'var(--fg-4)' } }, String(entries.length)),
    );

    return h('div', { style: s.container },

      sectionHeader,

      // Header: month nav + new entry button
      h('div', { style: s.header },
        h('button', { onClick: prevMonth, style: s.navBtn, title: 'Previous month' }, '‹'),
        h('span', { style: s.monthLabel }, `${MONTH_NAMES[month - 1]} ${year}`),
        h('button', { onClick: nextMonth, style: s.navBtn, title: 'Next month' }, '›'),
        h('button', {
          onClick: handleNewEntry,
          disabled: creating,
          style: s.newBtn,
          title: "Create today's daily note",
        }, creating ? '...' : '+ New Entry')
      ),

      // Entry list
      loading
        ? h('div', { style: s.emptyMsg }, 'Loading...')
        : entries.length === 0
        ? h('div', { style: s.emptyMsg },
            `No journal entries for ${MONTH_NAMES[month - 1]} ${year}.`
          )
        : h('div', { style: s.list },
            entries.map((entry: any) =>
              h('div', {
                key: entry.date,
                style: s.entryItem,
                onClick: () => handleOpenEntry(entry),
                onMouseEnter: (e: any) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; },
                onMouseLeave: (e: any) => { e.currentTarget.style.background = 'transparent'; },
              },
                h('div', { style: s.entryDate }, entry.date),
                h('div', { style: s.entryTitle }, entry.title),
                h('div', { style: s.entryRow },
                  entry.preview
                    ? h('span', { style: s.entryPreview }, entry.preview)
                    : null,
                  entry.wordCount > 0
                    ? h('span', { style: s.badge }, `${entry.wordCount}w`)
                    : null
                )
              )
            )
          )
    );
  }

  return JournalPanel;
}

export function activate(api: ClientPluginAPI): void {
  const JournalPanel = createJournalPanel(api);

  api.ui.registerSidebarPanel(JournalPanel, {
    id: 'calendar-journal',
    title: 'Journal',
    icon: 'book-open',
    order: 25,
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
