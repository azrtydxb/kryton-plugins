import type { PluginAPI } from '../../../types/server';
import * as https from 'https';
import * as http from 'http';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseFeed } = require('../parser.js') as {
  parseFeed: (xml: string) => { title: string; items: ParsedItem[] };
};

interface ParsedItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

interface Feed {
  id: string;
  url: string;
  title: string;
  addedAt: string;
  seenGuids?: string[];
  unread?: number;
}

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string;
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      headers: {
        'User-Agent': 'Kryton RSS Reader/1.0',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      timeout: 10000,
    };

    const req = lib.get(options as any, (resp: import('http').IncomingMessage) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        fetchUrl(resp.headers.location).then(resolve).catch(reject);
        return;
      }
      if (resp.statusCode && resp.statusCode >= 400) {
        reject(new Error(`HTTP ${resp.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      resp.on('data', (c: Buffer) => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      resp.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

const FEEDS_STORAGE_KEY = 'rss:feeds';
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function activate(api: PluginAPI): void {
  api.log.info('RSS Reader plugin activated');

  // GET /feeds
  api.routes.register('get', '/feeds', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    try {
      const feeds = (await api.storage.get(FEEDS_STORAGE_KEY, userId) as Feed[] | null) ?? [];
      res.json({ feeds });
    } catch {
      res.json({ feeds: [] });
    }
  });

  // POST /feeds — add a feed
  api.routes.register('post', '/feeds', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const url: string = req.body?.url;
    if (!url) { res.status(400).json({ error: 'Missing url' }); return; }

    try {
      let title = url;
      try {
        const xml = await fetchUrl(url);
        const parsed = parseFeed(xml);
        title = parsed.title || url;
      } catch {
        // Use URL as title if fetch/parse fails
      }

      const feeds = (await api.storage.get(FEEDS_STORAGE_KEY, userId) as Feed[] | null) ?? [];

      if (feeds.some((f) => f.url === url)) {
        res.status(409).json({ error: 'Feed already exists' });
        return;
      }

      const newFeed: Feed = {
        id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url,
        title,
        addedAt: new Date().toISOString(),
        seenGuids: [],
        unread: 0,
      };

      feeds.push(newFeed);
      await api.storage.set(FEEDS_STORAGE_KEY, feeds, userId);
      res.json({ feed: newFeed });
    } catch (err: any) {
      api.log.error('RSS POST /feeds error', err);
      res.status(500).json({ error: err?.message ?? 'Failed to add feed' });
    }
  });

  // DELETE /feeds/:id
  api.routes.register('delete', '/feeds/:id', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const id: string = req.params.id;
    try {
      const feeds = (await api.storage.get(FEEDS_STORAGE_KEY, userId) as Feed[] | null) ?? [];
      const updated = feeds.filter((f) => f.id !== id);
      await api.storage.set(FEEDS_STORAGE_KEY, updated, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to remove feed' });
    }
  });

  // POST /feeds/:id/read — mark feed as read (reset unread counter)
  api.routes.register('post', '/feeds/:id/read', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const id: string = req.params.id;
    try {
      const feeds = (await api.storage.get(FEEDS_STORAGE_KEY, userId) as Feed[] | null) ?? [];
      const idx = feeds.findIndex((f) => f.id === id);
      if (idx === -1) { res.status(404).json({ error: 'Feed not found' }); return; }
      feeds[idx].unread = 0;
      await api.storage.set(FEEDS_STORAGE_KEY, feeds, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to mark read' });
    }
  });

  // GET /feeds/:id/items
  api.routes.register('get', '/feeds/:id/items', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const id: string = req.params.id;
    try {
      const feeds = (await api.storage.get(FEEDS_STORAGE_KEY, userId) as Feed[] | null) ?? [];
      const feed = feeds.find((f) => f.id === id);
      if (!feed) { res.status(404).json({ error: 'Feed not found' }); return; }

      const xml = await fetchUrl(feed.url);
      const parsed = parseFeed(xml);
      const items: FeedItem[] = parsed.items.slice(0, 50).map((it) => ({
        title: it.title || '(No title)',
        link: it.link || '',
        description: it.description || '',
        pubDate: it.pubDate || '',
        guid: it.guid,
      }));

      res.json({ items });
    } catch (err: any) {
      api.log.error('RSS GET /feeds/:id/items error', err);
      res.status(500).json({ error: err?.message ?? 'Failed to fetch feed' });
    }
  });

  // POST /clip — save an article as a note
  api.routes.register('post', '/clip', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { title, url, content } = req.body ?? {};
    if (!title || !url) { res.status(400).json({ error: 'Missing title or url' }); return; }

    const safeTitle = String(title).replace(/[/\\:*?"<>|]/g, '-').slice(0, 80);
    const notePath = `RSS Clips/${safeTitle}`;
    const noteContent = [
      `# ${title}`,
      '',
      `Source: ${url}`,
      `Clipped: ${new Date().toISOString().slice(0, 10)}`,
      '',
      '---',
      '',
      content ? String(content) : '',
    ].join('\n');

    try {
      await api.notes.create(userId, notePath, noteContent);
      res.json({ path: `${notePath}.md` });
    } catch (err: any) {
      api.log.error('RSS POST /clip error', err);
      res.status(500).json({ error: err?.message ?? 'Failed to save note' });
    }
  });

  // Scheduler — periodically poll all subscribed feeds across all users and
  // update per-feed unread counts. Reads refresh interval from plugin settings
  // (`refreshIntervalMinutes`, default 30). Set to 0 to disable polling.
  void (async () => {
    let intervalMin = 30;
    try {
      const v = await api.settings.get('refreshIntervalMinutes');
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) intervalMin = n;
    } catch {
      // settings unavailable — use default
    }

    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (!intervalMin) return;

    const tick = async (): Promise<void> => {
      try {
        const entries = await api.storage.list(FEEDS_STORAGE_KEY);
        for (const entry of entries) {
          if (entry.key !== FEEDS_STORAGE_KEY || !entry.userId) continue;
          const feeds = (entry.value as Feed[] | null) ?? [];
          let dirty = false;
          for (const feed of feeds) {
            try {
              const xml = await fetchUrl(feed.url);
              const { items } = parseFeed(xml);
              const seen = new Set(feed.seenGuids ?? []);
              const fresh = items.filter((i) => i.guid && !seen.has(i.guid));
              if (fresh.length) {
                feed.seenGuids = Array.from(new Set([
                  ...(feed.seenGuids ?? []),
                  ...items.map((i) => i.guid).filter(Boolean),
                ])).slice(-500);
                feed.unread = (feed.unread ?? 0) + fresh.length;
                dirty = true;
              } else if (feed.seenGuids === undefined) {
                // First sight — record current guids without bumping unread
                feed.seenGuids = items.map((i) => i.guid).filter(Boolean);
                if (feed.unread === undefined) feed.unread = 0;
                dirty = true;
              }
            } catch (e: any) {
              api.log.warn(`[rss-reader] poll failed for ${feed.url}: ${e?.message ?? e}`);
            }
          }
          if (dirty) {
            await api.storage.set(FEEDS_STORAGE_KEY, feeds, entry.userId);
          }
        }
      } catch (e: any) {
        api.log.warn(`[rss-reader] scheduler tick error: ${e?.message ?? e}`);
      }
    };

    pollTimer = setInterval(() => { void tick(); }, intervalMin * 60_000);
  })();
}

export function deactivate(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
