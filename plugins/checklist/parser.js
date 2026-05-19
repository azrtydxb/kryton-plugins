// CJS for compatibility with vitest default
module.exports.extractCheckboxes = function extractCheckboxes(noteContent, notePath) {
  const lines = noteContent.split('\n');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s+\[( |x|X)\]\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    items.push({ path: notePath, line: i + 1, checked: m[2].toLowerCase() === 'x', text: m[3].trim() });
  }
  return items;
};
