import type { PluginAPI } from '../../../types/server';

const HTML_TEMPLATE = (title: string, content: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      max-width: 760px;
      margin: 0 auto;
      padding: 40px 24px 80px;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fff;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin-top: 1.8em; }
    h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.2em; }
    a { color: #7c3aed; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 3px; font-size: 0.88em; }
    pre { background: #1e1e2e; color: #e0e0e0; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote { border-left: 4px solid #7c3aed; margin-left: 0; padding-left: 16px; color: #6b7280; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    hr { border: none; border-top: 2px solid #e5e7eb; margin: 2em 0; }
    .exported-note { max-width: 100%; }
    footer { margin-top: 60px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <article class="exported-note">
    ${markdownToHtml(content)}
  </article>
  <footer>Exported from Kryton</footer>
</body>
</html>`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal Markdown-to-HTML converter for exported notes
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inList = false;

  function flushList(): void {
    if (inList) {
      output.push('</ul>');
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fence
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        flushList();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        const escaped = codeLines.map(escapeHtml).join('\n');
        output.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escaped}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headings
    const h6 = line.match(/^######\s+(.*)$/);
    const h5 = line.match(/^#####\s+(.*)$/);
    const h4 = line.match(/^####\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h6) { flushList(); output.push(`<h6>${inlineMarkdown(h6[1])}</h6>`); continue; }
    if (h5) { flushList(); output.push(`<h5>${inlineMarkdown(h5[1])}</h5>`); continue; }
    if (h4) { flushList(); output.push(`<h4>${inlineMarkdown(h4[1])}</h4>`); continue; }
    if (h3) { flushList(); output.push(`<h3>${inlineMarkdown(h3[1])}</h3>`); continue; }
    if (h2) { flushList(); output.push(`<h2>${inlineMarkdown(h2[1])}</h2>`); continue; }
    if (h1) { flushList(); output.push(`<h1>${inlineMarkdown(h1[1])}</h1>`); continue; }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      flushList();
      output.push('<hr />');
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s*(.*)$/);
    if (bq) {
      flushList();
      output.push(`<blockquote>${inlineMarkdown(bq[1])}</blockquote>`);
      continue;
    }

    // Unordered list item
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        output.push('<ul>');
        inList = true;
      }
      output.push(`  <li>${inlineMarkdown(li[1])}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      output.push('');
      continue;
    }

    // Regular paragraph line
    flushList();
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  flushList();

  return output.join('\n');
}

function inlineMarkdown(text: string): string {
  return text
    // Bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Wiki-links (strip brackets)
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link">$1</span>');
}

export function activate(api: PluginAPI): void {
  api.log.info('Publish plugin activated');

  // POST /export — accepts { paths: string[] }, returns { files: [{ path, content }] }
  api.routes.register('post', '/export', async (req, res) => {
    const userId: string = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const paths: string[] = Array.isArray(req.body?.paths) ? req.body.paths : [];
    if (paths.length === 0) {
      res.status(400).json({ error: 'No paths provided' });
      return;
    }

    const files: Array<{ path: string; content: string }> = [];

    for (const notePath of paths) {
      try {
        const note = await api.notes.get(userId, notePath);
        const filename = notePath.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_') + '.html';
        const html = HTML_TEMPLATE(note.title || notePath, note.content);
        files.push({ path: filename, content: html });
      } catch (err: any) {
        api.log.warn(`Publish: could not read note at ${notePath}`, err);
        files.push({
          path: notePath.replace(/[^a-zA-Z0-9_-]/g, '_') + '.html',
          content: `<!DOCTYPE html><html><body><p>Error reading note: ${escapeHtml(notePath)}</p></body></html>`,
        });
      }
    }

    res.json({ files });
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
