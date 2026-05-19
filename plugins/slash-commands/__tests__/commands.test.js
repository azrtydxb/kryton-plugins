import { describe, it, expect } from 'vitest';
const { COMMANDS, filterCommands, resolveInsert, todayISO, nowHM } = require('../commands.js');

describe('filterCommands', () => {
  it('returns all commands for an empty query', () => {
    expect(filterCommands('')).toHaveLength(COMMANDS.length);
    expect(filterCommands(undefined)).toHaveLength(COMMANDS.length);
  });

  it('matches heading commands by id prefix', () => {
    const ids = filterCommands('h').map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['h1', 'h2', 'h3']));
  });

  it('returns [] for queries that match nothing', () => {
    expect(filterCommands('xyz')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(filterCommands('H1').map((c) => c.id)).toContain('h1');
  });

  it('matches by label substring when id prefix does not', () => {
    // "diagram" only appears in the mermaid description/label, not the id.
    const ids = filterCommands('mermaid').map((c) => c.id);
    expect(ids).toContain('mermaid');
  });
});

describe('resolveInsert', () => {
  it('returns static insert text verbatim', () => {
    const h1 = COMMANDS.find((c) => c.id === 'h1');
    expect(resolveInsert(h1)).toBe('# ');
  });

  it('renders /date as YYYY-MM-DD for "today"', () => {
    const fixed = new Date('2026-05-19T08:34:00');
    const date = COMMANDS.find((c) => c.id === 'date');
    expect(resolveInsert(date, fixed)).toBe('2026-05-19');
  });

  it('renders /time as HH:mm', () => {
    const fixed = new Date('2026-05-19T08:34:00');
    const time = COMMANDS.find((c) => c.id === 'time');
    expect(resolveInsert(time, fixed)).toBe('08:34');
  });

  it('renders /datetime as ISO', () => {
    const fixed = new Date('2026-05-19T08:34:00Z');
    const dt = COMMANDS.find((c) => c.id === 'datetime');
    expect(resolveInsert(dt, fixed)).toBe(fixed.toISOString());
  });
});

describe('helpers', () => {
  it('todayISO matches YYYY-MM-DD shape for a known date', () => {
    expect(todayISO(new Date('2026-01-02T00:00:00'))).toBe('2026-01-02');
  });
  it('nowHM zero-pads single digits', () => {
    expect(nowHM(new Date('2026-01-02T03:04:00'))).toBe('03:04');
  });
});
