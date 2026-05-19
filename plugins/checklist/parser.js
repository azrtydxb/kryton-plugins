// CJS for compatibility with vitest default
//
// extractCheckboxes — pull every Markdown task-list item (`- [ ]` / `- [x]`)
// from a note. Skips content inside fenced code blocks (``` … ```) so that
// kanban cards, code samples, and other fenced content don't surface as
// fake to-dos. The fence may use 3+ backticks or tildes; an opening fence
// of length N is only closed by a fence of >= N of the same char on a line
// of its own (CommonMark §4.5).
module.exports.extractCheckboxes = function extractCheckboxes(noteContent, notePath) {
  const lines = noteContent.split('\n');
  const items = [];
  let fenceChar = null;    // '`' or '~' while inside a fenced block
  let fenceLen = 0;        // opening fence length

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect fence open/close. A fence line is `^\s{0,3}([`~]{3,})\s*` —
    // a trailing info string is fine on open; close lines must be only
    // the fence chars (plus optional trailing whitespace).
    const fence = /^[ \t]{0,3}([`~])\1{2,}/.exec(line);
    if (fence) {
      const ch = fence[0].trim()[0];
      const len = fence[0].trim().length;
      if (fenceChar === null) {
        fenceChar = ch;
        fenceLen = len;
      } else if (ch === fenceChar && len >= fenceLen && /^[ \t]{0,3}[`~]{3,}\s*$/.test(line)) {
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }
    if (fenceChar !== null) continue; // inside a code fence — skip

    const m = /^(\s*)-\s+\[( |x|X)\]\s+(.+)$/.exec(line);
    if (!m) continue;
    items.push({ path: notePath, line: i + 1, checked: m[2].toLowerCase() === 'x', text: m[3].trim() });
  }
  return items;
};
