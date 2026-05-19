import { describe, it, expect } from 'vitest';
const { extractCheckboxes } = require('../parser.js');

describe('extractCheckboxes', () => {
  it('returns empty for note with no checkboxes', () => {
    expect(extractCheckboxes('plain text', 'a.md')).toEqual([]);
  });
  it('parses unchecked and checked items', () => {
    const md = '- [ ] todo\n- [x] done\n  - [X] indented';
    expect(extractCheckboxes(md, 'n.md')).toEqual([
      { path: 'n.md', line: 1, checked: false, text: 'todo' },
      { path: 'n.md', line: 2, checked: true, text: 'done' },
      { path: 'n.md', line: 3, checked: true, text: 'indented' },
    ]);
  });
  it('ignores non-checkbox bullets', () => {
    expect(extractCheckboxes('- plain bullet\n- [ ] real', 'n.md')).toHaveLength(1);
  });
});
