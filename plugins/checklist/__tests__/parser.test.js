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
  it('skips checkboxes inside fenced code blocks (e.g. kanban cards)', () => {
    const md = [
      '- [ ] real task',
      '```kanban',
      '## Done',
      '- [x] kanban card — not a real task',
      '```',
      '- [x] another real task',
    ].join('\n');
    const items = extractCheckboxes(md, 'n.md');
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.text)).toEqual(['real task', 'another real task']);
  });
  it('handles tilde fences and fences longer than 3', () => {
    const md = [
      '- [ ] before',
      '~~~~js',
      '- [x] inside tilde fence',
      '~~~~',
      '- [ ] after',
    ].join('\n');
    expect(extractCheckboxes(md, 'n.md').map((i) => i.text)).toEqual([
      'before',
      'after',
    ]);
  });
});
