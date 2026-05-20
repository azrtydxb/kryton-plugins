import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitStatus {
  dirty: boolean;
  lastCommitDate: string | null;
  lastCommitHash: string | null;
  pendingCommit: boolean;
}

interface GitCommit {
  hash: string;
  message: string;
  date: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'unknown';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Status bar component
// ---------------------------------------------------------------------------

function GitStatusBar(api: ClientPluginAPI): () => any {
  return function GitStatusBarItem(): any {
    const [status, setStatus] = useState<GitStatus | null>(null);

    const refresh = useCallback(() => {
      api.api
        .fetch('/status')
        .then((r) => r.json())
        .then((data: GitStatus) => setStatus(data))
        .catch(() => setStatus(null));
    }, []);

    useEffect(() => {
      refresh();
      const handle = setInterval(refresh, 30000); // refresh every 30 s
      return () => clearInterval(handle);
    }, [refresh]);

    if (!status) {
      return h(
        'div',
        { className: 'text-xs text-gray-400 dark:text-gray-500 px-2 flex items-center gap-1' },
        'git: —',
      );
    }

    const label = status.dirty
      ? `git: unsaved`
      : `git: ${formatRelativeTime(status.lastCommitDate)}`;

    const dotColor = status.dirty
      ? 'bg-yellow-400'
      : status.lastCommitDate
      ? 'bg-green-400'
      : 'bg-gray-400';

    return h(
      'div',
      {
        className: 'text-xs text-gray-500 dark:text-gray-400 px-2 flex items-center gap-1.5 cursor-default',
        title: status.lastCommitHash
          ? `Last commit: ${status.lastCommitHash} — ${status.lastCommitDate ?? ''}`
          : 'No commits yet',
      },
      h('span', { className: `inline-block w-1.5 h-1.5 rounded-full ${dotColor}` }),
      label,
    );
  };
}

// ---------------------------------------------------------------------------
// History panel component
// ---------------------------------------------------------------------------

function GitHistoryPanel(api: ClientPluginAPI): () => any {
  return function GitHistory(): any {
    const [commits, setCommits] = useState<GitCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [pushing, setPushing] = useState(false);
    const [status, setStatus] = useState<GitStatus | null>(null);

    const loadLog = useCallback(() => {
      setLoading(true);
      api.api
        .fetch('/log')
        .then((r) => r.json())
        .then((data: { commits: GitCommit[] }) => {
          setCommits(data.commits ?? []);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }, []);

    const loadStatus = useCallback(() => {
      api.api
        .fetch('/status')
        .then((r) => r.json())
        .then((data: GitStatus) => setStatus(data))
        .catch(() => setStatus(null));
    }, []);

    useEffect(() => {
      loadLog();
      loadStatus();
    }, [loadLog, loadStatus]);

    const statusText = status === null
      ? '—'
      : status.dirty ? 'unsaved' : 'clean';

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
      h('span', null, 'GIT BACKUP'),
      h('span', { style: { color: 'var(--fg-4)' } }, statusText),
    );

    function handleCommitNow(): void {
      api.api
        .fetch('/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then((r) => r.json())
        .then((data: { success: boolean; hash?: string; error?: string }) => {
          if (data.success) {
            api.notify.success(`Committed: ${data.hash ?? ''}`);
            loadLog();
          } else {
            api.notify.error(data.error ?? 'Commit failed');
          }
        })
        .catch((err: Error) => api.notify.error(err.message));
    }

    function handlePush(): void {
      setPushing(true);
      api.api
        .fetch('/push', { method: 'POST' })
        .then((r) => r.json())
        .then((data: { success: boolean; error?: string }) => {
          if (data.success) {
            api.notify.success('Pushed to remote.');
          } else {
            api.notify.error(data.error ?? 'Push failed');
          }
          setPushing(false);
        })
        .catch((err: Error) => {
          api.notify.error(err.message);
          setPushing(false);
        });
    }

    return h(
      'div',
      { className: 'flex flex-col h-full' },

      sectionHeader,

      // Toolbar
      h(
        'div',
        { className: 'flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700' },
        h(
          'button',
          {
            onClick: handleCommitNow,
            className:
              'px-3 py-1 text-xs rounded bg-violet-500 hover:bg-violet-600 text-white ' +
              'font-medium transition-colors',
          },
          'Commit Now',
        ),
        h(
          'button',
          {
            onClick: handlePush,
            disabled: pushing,
            className:
              'px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 ' +
              'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 ' +
              'transition-colors disabled:opacity-50',
          },
          pushing ? 'Pushing…' : 'Push',
        ),
        h(
          'button',
          {
            onClick: loadLog,
            className: 'ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors',
            title: 'Refresh',
          },
          '↺',
        ),
      ),

      // Commit list — VSCode git-graph style: thin vertical line on the
      // left with a dot at each commit. First 10 visible, rest reachable
      // by scrolling within the panel (themed scrollbar via
      // data-kryton-sidebar-scroll opt-in).
      loading
        ? h(
            'div',
            { style: { padding: '8px 12px', color: 'var(--fg-4)', fontSize: 11.5, fontStyle: 'italic' } },
            'Loading…',
          )
        : commits.length === 0
        ? h(
            'div',
            { style: { padding: '6px 12px 10px', color: 'var(--fg-4)', fontSize: 11.5, fontStyle: 'italic' } },
            'No commits yet. Auto-commit on save (see settings).',
          )
        : h(
            'ul',
            {
              // ~10 rows × 44px row height ≈ 440px. We cap there and let
              // the rest scroll — keeps the panel a predictable size in
              // the sidebar so it doesn't dominate.
              'data-kryton-sidebar-scroll': '',
              style: {
                listStyle: 'none',
                padding: 0,
                margin: 0,
                maxHeight: 440,
                overflowY: 'auto',
                overflowX: 'hidden',
              },
            },
            commits.map((commit: GitCommit, idx: number) => {
              const isFirst = idx === 0;
              const isLast = idx === commits.length - 1;
              return h(
                'li',
                {
                  key: commit.hash,
                  style: {
                    position: 'relative',
                    padding: '8px 10px 8px 24px',
                    cursor: 'default',
                  },
                  onMouseEnter: (e: any) => {
                    e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))';
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.background = 'transparent';
                  },
                },
                // Vertical graph line — trimmed at the boundaries so it
                // doesn't dangle past the first or last commit.
                h('div', {
                  style: {
                    position: 'absolute',
                    left: 11,
                    top: isFirst ? 14 : 0,
                    bottom: isLast ? 'auto' : 0,
                    height: isLast ? 14 : undefined,
                    width: 1,
                    background: 'var(--line-strong, var(--line))',
                  },
                }),
                // Commit dot — accent fill with a bg-colored border so it
                // visually "cuts" the line, matching VSCode's git graph.
                h('div', {
                  style: {
                    position: 'absolute',
                    left: 7,
                    top: 11,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: '2px solid var(--bg-1)',
                    boxSizing: 'border-box',
                  },
                }),
                // Hash + time row
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                    },
                  },
                  h(
                    'span',
                    {
                      style: {
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 11,
                        color: 'var(--accent)',
                        flexShrink: 0,
                      },
                    },
                    commit.hash.slice(0, 7),
                  ),
                  h(
                    'span',
                    {
                      style: {
                        fontSize: 10.5,
                        color: 'var(--fg-4)',
                        flexShrink: 0,
                      },
                    },
                    formatRelativeTime(commit.date),
                  ),
                ),
                // Message — single-line truncated, full text in title
                h(
                  'div',
                  {
                    title: commit.message,
                    style: {
                      fontSize: 12,
                      color: 'var(--fg-1)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  commit.message,
                ),
              );
            }),
          ),
    );
  };
}

// ---------------------------------------------------------------------------
// Plugin activation
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  // Status bar: last backup time
  api.ui.registerStatusBarItem(GitStatusBar(api), {
    id: 'git-backup-status',
    position: 'right',
    order: 10,
  });

  // Sidebar panel: commit history
  api.ui.registerSidebarPanel(GitHistoryPanel(api), {
    id: 'git-backup-history',
    title: 'Git History',
    icon: 'git-branch',
    order: 50,
  });

  // Command: Commit Now
  api.commands.register({
    id: 'git-backup.commit',
    name: 'Git: Commit Now',
    execute() {
      api.api
        .fetch('/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then((r) => r.json())
        .then((data: { success: boolean; hash?: string; error?: string }) => {
          if (data.success) {
            api.notify.success(`Committed: ${data.hash ?? 'done'}`);
          } else {
            api.notify.error(data.error ?? 'Commit failed');
          }
        })
        .catch((err: Error) => api.notify.error(err.message));
    },
  });

  // Command: View History (opens the sidebar panel — navigating to it is
  // handled by the host; registering the command exposes it in the command palette)
  api.commands.register({
    id: 'git-backup.history',
    name: 'Git: View History',
    execute() {
      api.notify.info('Open the Git History panel in the sidebar to view commits.');
    },
  });
}

export function deactivate(): void {
  // No persistent resources to clean up
}
