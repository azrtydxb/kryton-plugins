import { describe, it, expect } from 'vitest';
const { parseBoard, serializeBoard, replaceFenceInRaw } = require('../board-model.js');

const SAMPLE = `## Todo
- Buy milk
- [#abc] Write spec
## Done
- [x] Old item`;

describe('board model', () => {
  it('parses columns and cards', () => {
    const b = parseBoard(SAMPLE);
    expect(b.columns.map(c => c.title)).toEqual(['Todo', 'Done']);
    expect(b.columns[0].cards[0]).toMatchObject({ id: null, text: 'Buy milk', done: false });
    expect(b.columns[0].cards[1]).toMatchObject({ id: 'abc', text: 'Write spec', done: false });
    expect(b.columns[1].cards[0]).toMatchObject({ done: true, text: 'Old item' });
  });

  it('round-trips identity for normalized input', () => {
    expect(serializeBoard(parseBoard(SAMPLE))).toBe(SAMPLE);
  });

  it('serializes a board with no cards in a column', () => {
    expect(serializeBoard({ columns: [{ title: 'Empty', cards: [] }] })).toBe('## Empty');
  });

  it('handles empty input', () => {
    expect(parseBoard('')).toEqual({ columns: [] });
    expect(serializeBoard({ columns: [] })).toBe('');
  });

  it('parses checked card with id', () => {
    const b = parseBoard('## Col\n- [x] [#xyz] Done with id');
    expect(b.columns[0].cards[0]).toMatchObject({ id: 'xyz', text: 'Done with id', done: true });
  });

  it('ignores bullets outside of a column', () => {
    const b = parseBoard('- orphan\n## Col\n- inside');
    expect(b.columns).toHaveLength(1);
    expect(b.columns[0].cards.map(c => c.text)).toEqual(['inside']);
  });
});

describe('replaceFenceInRaw', () => {
  const raw = 'intro\n\n```kanban\n## Todo\n- a\n```\n\noutro';

  it('replaces unique original source', () => {
    const orig = '```kanban\n## Todo\n- a\n```';
    const result = replaceFenceInRaw(raw, orig, '## Todo\n- a\n- b');
    expect(result).toBe('intro\n\n```kanban\n## Todo\n- a\n- b\n```\n\noutro');
  });

  it('falls back to first kanban fence when source not found', () => {
    const result = replaceFenceInRaw(raw, 'NOT-THERE', '## New');
    expect(result).toBe('intro\n\n```kanban\n## New\n```\n\noutro');
  });

  it('returns null when no kanban fence exists', () => {
    expect(replaceFenceInRaw('no fences here', null, '## X')).toBeNull();
  });
});
