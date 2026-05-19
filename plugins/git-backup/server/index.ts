import type { PluginAPI } from '../../../types/server';

// Declare require for Node built-ins — no @types/node in this project
declare function require(module: string): any;

type ExecFileFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout?: number },
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => void;

const { execFile } = require('child_process') as { execFile: ExecFileFn };
const pathMod = require('path') as { resolve: (...parts: string[]) => string };
const { buildCommitArgs, validateCwd } = require('../safe-args.js') as {
  buildCommitArgs(opts: { message: string; allFiles?: boolean }): string[];
  validateCwd(cwd: string, dataDir: string): string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Promise wrapper around execFile that resolves to trimmed stdout. */
function pExecFile(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout?: number },
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(cmd, args, opts, (err: Error | null, stdout: string, stderr: string) => {
      if (err) {
        reject(new Error((stderr || '').trim() || err.message));
      } else {
        resolve((stdout || '').trim());
      }
    });
  });
}

/** Resolve the notes root directory from the plugin's dataDir.
 *
 * Convention: plugin data lives at <notesRoot>/.kryton/plugins/<pluginId>/
 * We walk up three levels to reach the notes root.
 */
function resolveNotesDir(dataDir: string): string {
  return pathMod.resolve(dataDir, '..', '..', '..');
}

/** Replace {{date}} in a commit message template with the current ISO timestamp. */
function renderCommitMessage(template: string): string {
  return template.replace('{{date}}', new Date().toISOString());
}

// Per-instance git wrappers — bound to a notesRoot for validateCwd
function makeGit(notesRoot: string) {
  function ensure(cwd: string): string {
    return validateCwd(cwd, notesRoot);
  }
  return {
    add: (cwd: string) =>
      pExecFile('git', ['add', '-A'], { cwd: ensure(cwd), timeout: 30_000 }),
    commit: (cwd: string, message: string) => {
      const args = buildCommitArgs({ message, allFiles: false });
      return pExecFile('git', args, { cwd: ensure(cwd), timeout: 30_000 });
    },
    status: (cwd: string) =>
      pExecFile('git', ['status', '--porcelain'], { cwd: ensure(cwd), timeout: 10_000 }),
    log: (cwd: string, limit = 20) => {
      const max = Math.min(Math.max(1, parseInt(String(limit), 10) || 20), 200);
      return pExecFile(
        'git',
        ['log', `--max-count=${max}`, '--pretty=format:%H|%aI|%s'],
        { cwd: ensure(cwd), timeout: 10_000 },
      );
    },
    revParseShort: (cwd: string) =>
      pExecFile('git', ['rev-parse', '--short', 'HEAD'], { cwd: ensure(cwd), timeout: 10_000 }),
    lastLog: (cwd: string) =>
      pExecFile('git', ['log', '-1', '--format=%H %ci'], { cwd: ensure(cwd), timeout: 10_000 }),
    lastDate: (cwd: string) =>
      pExecFile('git', ['log', '-1', '--format=%ci'], { cwd: ensure(cwd), timeout: 10_000 }),
    push: (cwd: string) =>
      pExecFile('git', ['push'], { cwd: ensure(cwd), timeout: 60_000 }),
    version: () => pExecFile('git', ['--version'], { cwd: notesRoot, timeout: 5_000 }),
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface BackupState {
  pendingCommit: boolean;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastCommitTime: Date | null;
  lastCommitHash: string | null;
}

const state: BackupState = {
  pendingCommit: false,
  intervalHandle: null,
  lastCommitTime: null,
  lastCommitHash: null,
};

// ---------------------------------------------------------------------------
// Core backup function
// ---------------------------------------------------------------------------

async function performCommit(
  git: ReturnType<typeof makeGit>,
  notesDir: string,
  message: string,
  api: PluginAPI,
): Promise<void> {
  try {
    await git.add(notesDir);
    const statusOut = await git.status(notesDir);
    if (!statusOut) {
      api.log.info('git-backup: nothing to commit');
      return;
    }
    await git.commit(notesDir, message);
    state.lastCommitTime = new Date();
    const hash = await git.revParseShort(notesDir);
    state.lastCommitHash = hash;
    api.log.info(`git-backup: committed ${hash} — ${message}`);
    state.pendingCommit = false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    api.log.error(`git-backup: commit failed — ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export async function activate(api: PluginAPI): Promise<void> {
  api.log.info('Git Backup plugin activated');

  const notesDir = resolveNotesDir(api.plugin.dataDir);
  const git = makeGit(notesDir);

  // Ensure git binary is available; otherwise disable cleanly.
  try {
    await git.version();
  } catch {
    api.log.error('[git-backup] git binary not found; plugin disabled');
    return;
  }

  // Mark a commit as pending on every save
  api.events.on('note:afterSave', () => {
    state.pendingCommit = true;
  });

  // Populate last commit info on startup (best-effort)
  git
    .lastLog(notesDir)
    .then((out) => {
      if (out) {
        const spaceIdx = out.indexOf(' ');
        state.lastCommitHash = spaceIdx > 0 ? out.slice(0, spaceIdx) : out;
        const dateStr = spaceIdx > 0 ? out.slice(spaceIdx + 1).trim() : '';
        state.lastCommitTime = dateStr ? new Date(dateStr) : null;
      }
    })
    .catch(() => {
      // Not a git repo yet — fine
    });

  // Auto-commit interval — checked every minute
  async function maybeAutoCommit(): Promise<void> {
    if (!state.pendingCommit) return;
    const rawInterval = await api.settings.get('autoCommitInterval');
    const intervalMinutes = typeof rawInterval === 'number' ? rawInterval : 5;
    if (intervalMinutes === 0) return; // disabled

    const rawTemplate = await api.settings.get('commitMessage');
    const template =
      typeof rawTemplate === 'string' ? rawTemplate : 'auto-backup: {{date}}';

    await performCommit(git, notesDir, renderCommitMessage(template), api);
  }

  state.intervalHandle = setInterval(() => {
    maybeAutoCommit().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      api.log.error(`git-backup: interval error — ${msg}`);
    });
  }, 60 * 1000);

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  // GET /status
  api.routes.register('get', '/status', async (_req: unknown, res: any) => {
    try {
      const statusOut = await git.status(notesDir);
      let lastCommitDate: string | null = null;
      try {
        lastCommitDate = await git.lastDate(notesDir);
      } catch {
        // no commits yet
      }
      res.json({
        dirty: statusOut.length > 0,
        lastCommitDate: lastCommitDate || null,
        lastCommitHash: state.lastCommitHash,
        pendingCommit: state.pendingCommit,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // GET /log — last 20 commits (pipe-separated, parsed here)
  api.routes.register('get', '/log', async (_req: unknown, res: any) => {
    try {
      const logOut = await git.log(notesDir, 20);
      const entries = logOut
        .split('\n')
        .filter(Boolean)
        .map((line: string) => {
          const [hash, date, ...rest] = line.split('|');
          if (!hash) return null;
          return { hash, date: date ?? '', message: rest.join('|') };
        })
        .filter(Boolean);
      res.json({ commits: entries });
    } catch {
      res.json({ commits: [] });
    }
  });

  // POST /commit — manual commit
  api.routes.register('post', '/commit', async (req: any, res: any) => {
    const customMessage: string =
      req.body?.message
        ? String(req.body.message)
        : renderCommitMessage('manual backup: {{date}}');
    try {
      await performCommit(git, notesDir, customMessage, api);
      res.json({ success: true, hash: state.lastCommitHash, message: customMessage });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // POST /push — git push
  api.routes.register('post', '/push', async (_req: unknown, res: any) => {
    try {
      const out = await git.push(notesDir);
      res.json({ success: true, output: out });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });
}

export function deactivate(): void {
  if (state.intervalHandle !== null) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
  state.pendingCommit = false;
}
