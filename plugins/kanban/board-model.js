// CJS module — pure board model used by tests. The client TS file inlines
// equivalent helpers for runtime (esbuild builds with bundle:false, so
// cross-file requires would not resolve in the browser).
//
// Markdown shape:
//   ## Column Title
//   - Card text
//   - [x] Done card
//   - [#abc123] Card with stable id
//   - [x] [#abc123] Done card with id
//
// Round-trip is identity for normalized input (see tests).

function parseBoard(md) {
  const lines = String(md === null || md === undefined ? '' : md).split('\n');
  const columns = [];
  let cur = null;
  for (const raw of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h) {
      cur = { title: h[1], cards: [] };
      columns.push(cur);
      continue;
    }
    const c = /^\s*-\s+(?:\[(?<box>[ xX])\]\s+)?(?:\[#(?<id>[a-z0-9]+)\]\s+)?(?<text>.+?)\s*$/.exec(raw);
    if (c && cur) {
      cur.cards.push({
        id: c.groups.id || null,
        text: c.groups.text,
        done: (c.groups.box || '').toLowerCase() === 'x',
      });
    }
  }
  return { columns };
}

function serializeBoard(board) {
  const out = [];
  const cols = (board && board.columns) || [];
  for (const col of cols) {
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
function genId() {
  _idCounter++;
  return Date.now().toString(36) + _idCounter.toString(36);
}

// Locate a fenced kanban block in raw note content and return new content
// with the block body replaced. Returns null if the block can't be located.
//
// Strategy:
//   1. If we know the original `source` (the exact fence block as it appeared
//      in the parsed body) and it occurs exactly once in raw content,
//      replace it.
//   2. Otherwise, fall back to "find the Nth ```kanban ... ``` block",
//      where N is computed from how many kanban fences precede `source` in
//      the parsed body. If we don't have parsed-body context we replace the
//      first one.
function replaceFenceInRaw(rawContent, originalSource, newBody) {
  const fence = '```kanban\n' + newBody + '\n```';
  if (originalSource && typeof originalSource === 'string') {
    const idx = rawContent.indexOf(originalSource);
    if (idx !== -1 && rawContent.indexOf(originalSource, idx + 1) === -1) {
      return rawContent.slice(0, idx) + fence + rawContent.slice(idx + originalSource.length);
    }
  }
  // Fallback: replace the first ```kanban ... ``` block.
  const re = /```kanban\n[\s\S]*?\n```/;
  if (re.test(rawContent)) {
    return rawContent.replace(re, fence);
  }
  return null;
}

module.exports = { parseBoard, serializeBoard, genId, replaceFenceInRaw };
