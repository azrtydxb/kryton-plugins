import { describe, it, expect } from 'vitest';
const engine = require('../vim-engine.js');
const { step, applyMotion, parseCount, lineStartOf, lineEndOf, wordForward, wordBackward, wordEnd } = engine;

const mkState = (doc, head, anchor) => ({ doc, selection: { head, anchor: anchor === undefined || anchor === null ? head : anchor } });
const mkInput = (state, key, opts = {}) => ({
  state,
  mode: opts.mode || 'normal',
  buffer: opts.buffer || '',
  key,
  registers: opts.registers || { '"': '' },
  lastSearch: opts.lastSearch || null,
});

describe('vim-engine helpers', () => {
  const doc = 'hello world\nfoo bar baz\nlast line';

  it('lineStartOf / lineEndOf', () => {
    expect(lineStartOf(doc, 0)).toBe(0);
    expect(lineStartOf(doc, 14)).toBe(12);
    expect(lineEndOf(doc, 0)).toBe(11);
    expect(lineEndOf(doc, 14)).toBe(23);
  });

  it('wordForward / wordBackward / wordEnd', () => {
    // "hello world"
    //  01234567890
    expect(wordForward(doc, 0)).toBe(6);    // 'h' -> 'w'
    expect(wordBackward(doc, 6)).toBe(0);   // 'w' -> 'h'
    expect(wordEnd(doc, 0)).toBe(4);        // 'h' -> 'o'
  });
});

describe('parseCount', () => {
  it('extracts numeric prefix', () => {
    expect(parseCount('3j')).toEqual({ count: 3, rest: 'j' });
    expect(parseCount('12gg')).toEqual({ count: 12, rest: 'gg' });
    expect(parseCount('dd')).toEqual({ count: 1, rest: 'dd' });
  });
  it('treats leading 0 as motion, not count', () => {
    expect(parseCount('0')).toEqual({ count: 1, rest: '0' });
    expect(parseCount('10j')).toEqual({ count: 10, rest: 'j' });
  });
});

describe('applyMotion', () => {
  const doc = 'abc\ndef\nghi';

  it('h/l move by 1 char, clamped to line', () => {
    expect(applyMotion(doc, 1, 'l', 1)).toBe(2);
    expect(applyMotion(doc, 1, 'h', 1)).toBe(0);
    // l at end of line should not cross newline
    expect(applyMotion(doc, 2, 'l', 1)).toBe(2);
  });

  it('j/k move by line, preserving column', () => {
    expect(applyMotion(doc, 1, 'j', 1)).toBe(5); // 'b' -> 'e'
    expect(applyMotion(doc, 5, 'k', 1)).toBe(1);
  });

  it('count moves N lines', () => {
    expect(applyMotion(doc, 0, 'j', 2)).toBe(8); // 'a' -> 'g'
  });

  it('0 / $ go to line bounds', () => {
    expect(applyMotion(doc, 2, '0', 1)).toBe(0);
    expect(applyMotion(doc, 1, '$', 1)).toBe(3);
  });

  it('gg / G jump to doc bounds', () => {
    expect(applyMotion(doc, 5, 'gg', 1)).toBe(0);
    expect(applyMotion(doc, 0, 'G', 1)).toBe(8); // start of last line
  });
});

describe('step — mode transitions', () => {
  const state = mkState('hello', 2);

  it('i enters insert', () => {
    expect(step(mkInput(state, 'i'))).toMatchObject({ kind: 'mode', to: 'insert' });
  });
  it('a enters insert past cursor', () => {
    const r = step(mkInput(state, 'a'));
    expect(r).toMatchObject({ kind: 'mode', to: 'insert', moveTo: 3 });
  });
  it('I enters insert at line start (non-blank)', () => {
    const s = mkState('  foo', 4);
    expect(step(mkInput(s, 'I'))).toMatchObject({ kind: 'mode', to: 'insert', moveTo: 2 });
  });
  it('A enters insert at line end', () => {
    expect(step(mkInput(state, 'A'))).toMatchObject({ kind: 'mode', to: 'insert', moveTo: 5 });
  });
  it('o opens a new line below', () => {
    const r = step(mkInput(state, 'o'));
    expect(r).toMatchObject({ kind: 'insert', at: 5, text: '\n', enterInsert: true });
  });
  it('O opens a new line above', () => {
    const r = step(mkInput(state, 'O'));
    expect(r).toMatchObject({ kind: 'insert', at: 0, text: '\n', enterInsert: true });
  });
  it('v / V enter visual modes', () => {
    expect(step(mkInput(state, 'v'))).toMatchObject({ kind: 'mode', to: 'visual', anchor: 2 });
    expect(step(mkInput(state, 'V'))).toMatchObject({ kind: 'mode', to: 'visual-line', anchor: 2 });
  });
  it('Esc from insert returns to normal and steps cursor back', () => {
    const r = step(mkInput(mkState('hello', 3), 'Escape', { mode: 'insert' }));
    expect(r).toMatchObject({ kind: 'mode', to: 'normal', moveTo: 2 });
  });
  it('insert mode returns null for ordinary keys', () => {
    expect(step(mkInput(state, 'x', { mode: 'insert' }))).toBeNull();
  });
});

describe('step — motions', () => {
  const state = mkState('abc\ndef\nghi', 0);

  it('h j k l move cursor by 1', () => {
    expect(step(mkInput(state, 'l'))).toMatchObject({ kind: 'move', to: 1 });
    expect(step(mkInput(mkState('abc', 1), 'h'))).toMatchObject({ kind: 'move', to: 0 });
    expect(step(mkInput(state, 'j'))).toMatchObject({ kind: 'move', to: 4 });
    expect(step(mkInput(mkState('abc\ndef', 4), 'k'))).toMatchObject({ kind: 'move', to: 0 });
  });

  it('w moves to next word start', () => {
    const r = step(mkInput(mkState('foo bar', 0), 'w'));
    expect(r).toMatchObject({ kind: 'move', to: 4 });
  });

  it('b moves to previous word start', () => {
    const r = step(mkInput(mkState('foo bar', 4), 'b'));
    expect(r).toMatchObject({ kind: 'move', to: 0 });
  });

  it('e moves to current word end', () => {
    const r = step(mkInput(mkState('foo bar', 0), 'e'));
    expect(r).toMatchObject({ kind: 'move', to: 2 });
  });

  it('0 / $ go to line bounds', () => {
    expect(step(mkInput(mkState('hello', 3), '0'))).toMatchObject({ kind: 'move', to: 0 });
    expect(step(mkInput(mkState('hello', 0), '$'))).toMatchObject({ kind: 'move', to: 5 });
  });

  it('gg goes to doc start (two-key)', () => {
    let r = step(mkInput(mkState('abc\ndef', 5), 'g'));
    expect(r).toMatchObject({ kind: 'consume', buffer: 'g' });
    r = step(mkInput(mkState('abc\ndef', 5), 'g', { buffer: 'g' }));
    expect(r).toMatchObject({ kind: 'move', to: 0 });
  });

  it('G goes to last-line start', () => {
    const r = step(mkInput(mkState('abc\ndef\nghi', 0), 'G'));
    expect(r).toMatchObject({ kind: 'move', to: 8 });
  });

  it('3j moves down 3 lines', () => {
    const doc = 'a\nb\nc\nd\ne';
    // pos 0 (line 0) -> line 3 (pos 6 = 'd')
    let r = step(mkInput(mkState(doc, 0), '3'));
    expect(r).toMatchObject({ kind: 'consume', buffer: '3' });
    r = step(mkInput(mkState(doc, 0), 'j', { buffer: '3' }));
    expect(r).toMatchObject({ kind: 'move', to: 6 });
  });
});

describe('step — operators', () => {
  it('x deletes char under cursor', () => {
    const r = step(mkInput(mkState('hello', 1), 'x'));
    expect(r).toMatchObject({ kind: 'delete', from: 1, to: 2, register: '"' });
  });

  it('dd deletes the current line', () => {
    const doc = 'first\nsecond\nthird';
    let r = step(mkInput(mkState(doc, 7), 'd'));
    expect(r).toMatchObject({ kind: 'consume', buffer: 'd' });
    r = step(mkInput(mkState(doc, 7), 'd', { buffer: 'd' }));
    expect(r).toMatchObject({ kind: 'delete', lineWise: true });
    expect(doc.slice(r.from, r.to)).toBe('second\n');
  });

  it('d$ deletes to end of line', () => {
    const doc = 'hello world';
    let r = step(mkInput(mkState(doc, 5), 'd'));
    r = step(mkInput(mkState(doc, 5), '$', { buffer: 'd' }));
    expect(r).toMatchObject({ kind: 'delete', from: 5, to: 11 });
  });

  it('dw deletes word', () => {
    const doc = 'foo bar';
    let r = step(mkInput(mkState(doc, 0), 'd'));
    r = step(mkInput(mkState(doc, 0), 'w', { buffer: 'd' }));
    expect(r).toMatchObject({ kind: 'delete', from: 0, to: 4 });
  });

  it('yy + p round-trips a line', () => {
    const doc = 'aaa\nbbb\nccc';
    // yy on line 1 ('bbb')
    let r = step(mkInput(mkState(doc, 4), 'y'));
    r = step(mkInput(mkState(doc, 4), 'y', { buffer: 'y' }));
    expect(r).toMatchObject({ kind: 'yank', lineWise: true, text: 'bbb\n' });
    const yanked = r.text;
    // p — paste after current line on line 0 -> inserts between line 0 and 1
    r = step(mkInput(mkState(doc, 1), 'p', { registers: { '"': yanked } }));
    expect(r).toMatchObject({ kind: 'paste', lineWise: true, after: true });
    expect(r.at).toBe(4);
    expect(r.text).toBe('bbb\n');
  });
});

describe('step — replace and undo', () => {
  it('r{char} returns replace tx', () => {
    let r = step(mkInput(mkState('abc', 1), 'r'));
    expect(r).toMatchObject({ kind: 'consume', buffer: 'r' });
    r = step(mkInput(mkState('abc', 1), 'X', { buffer: 'r' }));
    expect(r).toMatchObject({ kind: 'replace', at: 1, text: 'X' });
  });

  it('u returns undo', () => {
    expect(step(mkInput(mkState('abc', 0), 'u'))).toMatchObject({ kind: 'undo' });
  });
});

describe('step — ex / search openers', () => {
  it(': opens ex prompt', () => {
    expect(step(mkInput(mkState('abc', 0), ':'))).toMatchObject({ kind: 'ex-open' });
  });
  it('/ opens search', () => {
    expect(step(mkInput(mkState('abc', 0), '/'))).toMatchObject({ kind: 'search-open' });
  });
});

describe('step — visual mode', () => {
  it('Esc from visual returns to normal', () => {
    const r = step(mkInput(mkState('abc', 1, 0), 'Escape', { mode: 'visual' }));
    expect(r).toMatchObject({ kind: 'mode', to: 'normal' });
  });

  it('d in visual deletes selection', () => {
    const r = step(mkInput(mkState('hello', 3, 1), 'd', { mode: 'visual' }));
    expect(r).toMatchObject({ kind: 'delete', from: 1, to: 4, exitMode: 'normal' });
  });

  it('y in visual yanks selection', () => {
    const r = step(mkInput(mkState('hello', 3, 1), 'y', { mode: 'visual' }));
    expect(r).toMatchObject({ kind: 'yank', text: 'ell' });
  });

  it('motions in visual move head', () => {
    const r = step(mkInput(mkState('hello', 1, 1), 'l', { mode: 'visual' }));
    expect(r).toMatchObject({ kind: 'move', to: 2 });
  });
});

describe('step — f/F/t/T', () => {
  it('f finds next char on line', () => {
    let r = step(mkInput(mkState('hello world', 0), 'f'));
    r = step(mkInput(mkState('hello world', 0), 'o', { buffer: 'f' }));
    expect(r).toMatchObject({ kind: 'move', to: 4 });
  });
  it('F finds previous char on line', () => {
    let r = step(mkInput(mkState('hello', 4), 'F'));
    r = step(mkInput(mkState('hello', 4), 'h', { buffer: 'F' }));
    expect(r).toMatchObject({ kind: 'move', to: 0 });
  });
});

describe('step — star/hash search word under cursor', () => {
  it('* finds the word under cursor', () => {
    const r = step(mkInput(mkState('foo bar foo', 0), '*'));
    expect(r).toMatchObject({ kind: 'search', text: 'foo', forward: true });
  });
});
