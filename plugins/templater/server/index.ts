import type { PluginAPI, NoteEntry } from '../../../types/server';

// Declare require for the shared engine — no @types/node in this project
declare function require(module: string): any;

const { processTemplate, extractPrompts } = require('../template-engine.js') as {
  processTemplate(
    template: string,
    ctx?: {
      now?: Date;
      vars?: Record<string, string>;
      prompts?: Record<string, string>;
    },
  ): string;
  extractPrompts(template: string): string[];
};

/**
 * Recursively collect all file paths from a NoteEntry tree.
 */
function collectPaths(entries: NoteEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type === 'file') {
      paths.push(entry.path);
    } else if (entry.children) {
      paths.push(...collectPaths(entry.children));
    }
  }
  return paths;
}

export function activate(api: PluginAPI): void {
  api.log.info('Templater plugin activated');

  // POST /process — process a template string
  api.routes.register('post', '/process', async (req, res) => {
    try {
      const { template, variables, vars, prompts } = req.body as {
        template?: string;
        variables?: Record<string, string>;
        vars?: Record<string, string>;
        prompts?: Record<string, string>;
      };

      if (typeof template !== 'string') {
        res.status(400).json({ error: 'template (string) is required' });
        return;
      }

      const processed = processTemplate(template, {
        vars: vars ?? variables ?? {},
        prompts: prompts ?? {},
      });
      res.json({ content: processed });
    } catch (err: any) {
      api.log.error('Templater /process error', err);
      res.status(500).json({ error: 'Failed to process template' });
    }
  });

  // POST /extract-prompts — list {{prompt:NAME}} placeholders in a template
  api.routes.register('post', '/extract-prompts', async (req, res) => {
    try {
      const { template } = req.body as { template?: string };
      if (typeof template !== 'string') {
        res.status(400).json({ error: 'template (string) is required' });
        return;
      }
      res.json({ prompts: extractPrompts(template) });
    } catch (err: any) {
      api.log.error('Templater /extract-prompts error', err);
      res.status(500).json({ error: 'Failed to extract prompts' });
    }
  });

  // GET /template?path=... — fetch template body by path (template files live in Templates/)
  api.routes.register('get', '/template', async (req, res) => {
    try {
      const userId: string = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const tpath = String((req.query as any)?.path ?? '');
      if (!tpath) {
        res.status(400).json({ error: 'path query param required' });
        return;
      }
      const logicalPath = tpath.replace(/\.md$/i, '');
      const note = await api.notes.get(userId, logicalPath);
      res.json({ content: note.content });
    } catch (err: any) {
      api.log.error('Templater /template error', err);
      res.status(500).json({ error: err.message ?? 'Failed to read template' });
    }
  });

  // GET /templates — list available template files in Templates/ folder
  api.routes.register('get', '/templates', async (req, res) => {
    try {
      const userId: string = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      let entries: NoteEntry[] = [];
      try {
        entries = await api.notes.list(userId, 'Templates');
      } catch {
        // Templates folder may not exist yet
        res.json({ templates: [] });
        return;
      }

      const paths = collectPaths(entries);
      const templates = paths
        .filter((p) => p.endsWith('.md'))
        .map((p) => {
          const parts = p.split('/');
          const filename = parts[parts.length - 1] ?? p;
          const name = filename.replace(/\.md$/i, '');
          return { name, path: p };
        });

      res.json({ templates });
    } catch (err: any) {
      api.log.error('Templater /templates error', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
