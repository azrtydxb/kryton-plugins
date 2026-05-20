import { describe, it, expect } from 'vitest';
const {
  parseTable,
  isSeparatorRow,
  formatTable,
  formatTableAtCursor,
} = require('../format.js');

describe('parseTable', () => {
  it('returns null for non-table text', () => {
    expect(parseTable('hello world')).toBeNull();
  });
  it('parses a two-line table (header + separator)', () => {
    const rows = parseTable('| a | b |\n| --- | --- |');
    expect(rows).toEqual([
      ['a', 'b'],
      ['---', '---'],
    ]);
  });
});

describe('isSeparatorRow', () => {
  it('recognises plain dashes', () => {
    expect(isSeparatorRow(['---', '---'])).toBe(true);
  });
  it('recognises alignment markers', () => {
    expect(isSeparatorRow([':---', '---:', ':--:'])).toBe(true);
  });
  it('rejects cells with content', () => {
    expect(isSeparatorRow(['a', '---'])).toBe(false);
  });
});

describe('formatTable', () => {
  it('pads columns to the widest cell', () => {
    const out = formatTable([
      ['a', 'long-header'],
      ['---', '---'],
      ['x', 'y'],
    ]);
    const lines = out.split('\n');
    // header row
    expect(lines[0]).toBe('| a   | long-header |');
    // separator dashes match column width
    expect(lines[1]).toBe('| --- | ----------- |');
    // body row padded
    expect(lines[2]).toBe('| x   | y           |');
  });
  it('preserves alignment colons in the separator', () => {
    const out = formatTable([
      ['a', 'b'],
      [':---', '---:'],
      ['1', '2'],
    ]);
    const lines = out.split('\n');
    expect(lines[1].startsWith('| :')).toBe(true);
    expect(lines[1].endsWith(': |')).toBe(true);
  });
});

describe('formatTableAtCursor', () => {
  it('returns null when the cursor is not in a table', () => {
    expect(formatTableAtCursor('just prose\nno tables here', 3)).toBeNull();
  });

  it('formats a table when the cursor sits inside it', () => {
    const content = ['intro', '| a | longer |', '| - | - |', '| 1 | 2 |', 'outro'].join('\n');
    // Cursor on the header row.
    const cursor = content.indexOf('| a |') + 2;
    const r = formatTableAtCursor(content, cursor);
    expect(r).not.toBeNull();
    // header padded (min column width 3 since separator is '---')
    expect(r.newContent).toContain('| a   | longer |');
    // body row padded to the same widths
    expect(r.newContent).toContain('| 1   | 2      |');
    // intro/outro lines survive
    expect(r.newContent.startsWith('intro\n')).toBe(true);
    expect(r.newContent.endsWith('\noutro')).toBe(true);
  });

  it('reports a table range covering the original block', () => {
    const content = '| a | b |\n| - | - |\n| 1 | 2 |';
    const r = formatTableAtCursor(content, 0);
    expect(r).not.toBeNull();
    expect(r.tableFrom).toBe(0);
    expect(r.tableTo).toBe(content.length);
    expect(r.formatted.split('\n').length).toBe(3);
  });
});
