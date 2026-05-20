// CJS pure helper — kept .js so vitest can require() it directly.
// Inlined verbatim into client/index.ts because the plugin is built with
// esbuild bundle:false (cross-file requires don't resolve at runtime).

function parseTable(text) {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return null;
  return lines.map((line) => {
    const trimmed = line.trim().replace(/^\||\|$/g, '');
    return trimmed.split('|').map((cell) => cell.trim());
  });
}

function isSeparatorRow(row) {
  return row.every((cell) => /^:?-+:?$/.test(cell.trim()) || cell.trim() === '');
}

function formatTable(rows) {
  if (rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push('');
    return padded;
  });
  const colWidths = Array(colCount).fill(3);
  for (const row of normalized) {
    if (isSeparatorRow(row)) continue;
    row.forEach((cell, i) => {
      if (cell.length > colWidths[i]) colWidths[i] = cell.length;
    });
  }
  return normalized
    .map((row) => {
      const cells = row.map((cell, i) => {
        if (isSeparatorRow(row)) {
          const c = cell.trim();
          const leftColon = c.startsWith(':');
          const rightColon = c.endsWith(':');
          const dashes = '-'.repeat(
            colWidths[i] - (leftColon ? 1 : 0) - (rightColon ? 1 : 0),
          );
          return (leftColon ? ':' : '') + dashes + (rightColon ? ':' : '');
        }
        return cell.padEnd(colWidths[i]);
      });
      return '| ' + cells.join(' | ') + ' |';
    })
    .join('\n');
}

/**
 * Given the full note content and cursor position, find the Markdown
 * table block at the cursor (if any), format it, and return the new
 * content + cursor delta. Returns null when the cursor is not inside a
 * table.
 *
 * The returned shape also includes the table's character range
 * (tableFrom..tableTo) and the formatted text so callers can dispatch a
 * minimal editor replace op instead of overwriting the whole document.
 */
function formatTableAtCursor(content, cursorPos) {
  const lines = content.split('\n');

  let charCount = 0;
  let cursorLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= cursorPos) {
      cursorLine = i;
      break;
    }
    charCount += lines[i].length + 1; // +1 for \n
  }
  if (cursorLine === -1) cursorLine = lines.length - 1;

  if (!lines[cursorLine] || !lines[cursorLine].trim().startsWith('|')) return null;

  let tableStart = cursorLine;
  while (tableStart > 0 && lines[tableStart - 1].trim().startsWith('|')) tableStart--;
  let tableEnd = cursorLine;
  while (tableEnd < lines.length - 1 && lines[tableEnd + 1].trim().startsWith('|')) tableEnd++;

  const tableLines = lines.slice(tableStart, tableEnd + 1);
  const parsed = parseTable(tableLines.join('\n'));
  if (!parsed) return null;
  const formatted = formatTable(parsed);

  // Character range of the table block in the original content.
  const beforeTable = lines.slice(0, tableStart).join('\n');
  const tableFrom = tableStart === 0 ? 0 : beforeTable.length + 1;
  const oldTableText = tableLines.join('\n');
  const tableTo = tableFrom + oldTableText.length;

  const newLines = [
    ...lines.slice(0, tableStart),
    ...formatted.split('\n'),
    ...lines.slice(tableEnd + 1),
  ];
  const newContent = newLines.join('\n');

  const cursorInTable = cursorPos - tableFrom;
  const newCursorPos = Math.min(tableFrom + cursorInTable, tableFrom + formatted.length);

  return {
    newContent,
    cursorOffset: newCursorPos - cursorPos,
    tableFrom,
    tableTo,
    formatted,
  };
}

module.exports = { parseTable, isSeparatorRow, formatTable, formatTableAtCursor };
