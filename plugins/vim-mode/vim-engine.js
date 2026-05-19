// Vim engine — pure functions, CJS module used by tests.
//
// The client/index.ts inlines an equivalent runtime copy (esbuild builds
// plugins with bundle:false, so cross-file requires would not resolve in
// the browser). Keep this file authoritative; mirror changes into
// client/index.ts.
//
// ## Contract
//
// `step(input)` takes:
//   {
//     state: { doc: string, selection: { anchor, head } },
//     mode:  'normal' | 'insert' | 'visual' | 'visual-line',
//     buffer: string,            // pending keys since last completed cmd
//     key: string,               // the key just pressed (single char or 'Escape', 'Enter', etc.)
//     registers: { '"': string }, // unnamed register
//     lastSearch: string | null,
//   }
//
// and returns one of:
//   { kind: 'consume',  buffer: string }                      // accumulate, no-op
//   { kind: 'mode',     to: string, buffer: '', tx?: Tx }     // mode change
//   { kind: 'move',     to: number, buffer: '' }              // move cursor (absolute pos)
//   { kind: 'delete',   from: number, to: number, buffer: '', register?: string, lineWise?: boolean }
//   { kind: 'yank',     text: string, buffer: '', lineWise?: boolean }
//   { kind: 'insert',   at: number, text: string, buffer: '' }
//   { kind: 'replace',  at: number, text: string, buffer: '' } // 1-char replace
//   { kind: 'undo',     buffer: '' }
//   { kind: 'paste',    at: number, text: string, buffer: '', lineWise?: boolean, after?: boolean }
//   { kind: 'search-open', buffer: '' }
//   { kind: 'ex-open',     buffer: '' }
//   { kind: 'noop',     buffer: '' }
//   null                                                       // not handled (fall through)

'use strict';

// ---------- helpers over the document string ----------

function lineStartOf(doc, pos) {
  if (pos <= 0) return 0;
  const i = doc.lastIndexOf('\n', pos - 1);
  return i === -1 ? 0 : i + 1;
}

function lineEndOf(doc, pos) {
  const i = doc.indexOf('\n', pos);
  return i === -1 ? doc.length : i;
}

function lineNumberOf(doc, pos) {
  let n = 0;
  for (let i = 0; i < pos && i < doc.length; i++) if (doc.charCodeAt(i) === 10) n++;
  return n;
}

function posOfLine(doc, lineNo) {
  if (lineNo <= 0) return 0;
  let n = 0;
  for (let i = 0; i < doc.length; i++) {
    if (doc.charCodeAt(i) === 10) {
      n++;
      if (n === lineNo) return i + 1;
    }
  }
  return doc.length;
}

function lineCount(doc) {
  if (!doc) return 1;
  let n = 1;
  for (let i = 0; i < doc.length; i++) if (doc.charCodeAt(i) === 10) n++;
  return n;
}

// ---------- word motions ----------

function isWordChar(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}

function classOf(ch) {
  if (ch === undefined || ch === '\n') return 'nl';
  if (/\s/.test(ch)) return 'ws';
  if (isWordChar(ch)) return 'w';
  return 'p';
}

function wordForward(doc, pos) {
  // 'w' — to start of next word
  const n = doc.length;
  let i = pos;
  const startClass = classOf(doc[i]);
  // skip current run
  while (i < n && classOf(doc[i]) === startClass && startClass !== 'ws') i++;
  // skip whitespace/newlines
  while (i < n && (doc[i] === ' ' || doc[i] === '\t' || doc[i] === '\n')) i++;
  return Math.min(i, n);
}

function wordBackward(doc, pos) {
  // 'b' — to start of previous word
  let i = pos;
  if (i > 0) i--;
  while (i > 0 && (doc[i] === ' ' || doc[i] === '\t' || doc[i] === '\n')) i--;
  const cls = classOf(doc[i]);
  while (i > 0 && classOf(doc[i - 1]) === cls && cls !== 'ws') i--;
  return Math.max(i, 0);
}

function wordEnd(doc, pos) {
  // 'e' — to end of current/next word (inclusive char)
  const n = doc.length;
  let i = pos;
  if (i < n - 1) i++;
  while (i < n && (doc[i] === ' ' || doc[i] === '\t' || doc[i] === '\n')) i++;
  const cls = classOf(doc[i]);
  while (i < n - 1 && classOf(doc[i + 1]) === cls && cls !== 'ws') i++;
  return Math.min(i, n);
}

// ---------- motion resolver ----------
// Returns absolute position after applying motion `m` from `pos`, given doc.
// Count is the numeric prefix (defaults to 1).
function applyMotion(doc, pos, motion, count) {
  let p = pos;
  const c = Math.max(1, count || 1);
  for (let k = 0; k < c; k++) {
    switch (motion) {
      case 'h': {
        if (p > 0 && doc[p - 1] !== '\n') p--;
        break;
      }
      case 'l': {
        if (p < doc.length && doc[p] !== '\n') p++;
        if (p < doc.length && doc[p] === '\n') p--;
        break;
      }
      case 'j': {
        const col = p - lineStartOf(doc, p);
        const nextLine = lineNumberOf(doc, p) + 1;
        if (nextLine >= lineCount(doc)) { p = lineEndOf(doc, p); break; }
        const ls = posOfLine(doc, nextLine);
        const le = lineEndOf(doc, ls);
        p = Math.min(ls + col, le);
        break;
      }
      case 'k': {
        const col = p - lineStartOf(doc, p);
        const prevLine = lineNumberOf(doc, p) - 1;
        if (prevLine < 0) { p = lineStartOf(doc, p); break; }
        const ls = posOfLine(doc, prevLine);
        const le = lineEndOf(doc, ls);
        p = Math.min(ls + col, le);
        break;
      }
      case 'w': p = wordForward(doc, p); break;
      case 'b': p = wordBackward(doc, p); break;
      case 'e': p = wordEnd(doc, p); break;
      case '0': p = lineStartOf(doc, p); break;
      case '^': {
        const ls = lineStartOf(doc, p);
        const le = lineEndOf(doc, ls);
        let i = ls;
        while (i < le && (doc[i] === ' ' || doc[i] === '\t')) i++;
        p = i;
        break;
      }
      case '$': p = lineEndOf(doc, p); break;
      case 'gg': p = 0; break;
      case 'G': p = posOfLine(doc, Math.max(0, lineCount(doc) - 1)); break;
    }
  }
  return p;
}

// Returns { from, to, lineWise } range for an operator+motion combo.
function motionRange(doc, pos, motion, count) {
  if (motion === 'line') {
    // operator-doubled (dd, yy): the current line + trailing newline if any
    const ls = lineStartOf(doc, pos);
    let le = lineEndOf(doc, pos);
    if (le < doc.length) le++; // include newline
    else if (ls > 0) {
      // last line: include the preceding newline so the line is removed cleanly
      return { from: ls - 1, to: le, lineWise: true };
    }
    return { from: ls, to: le, lineWise: true };
  }
  const target = applyMotion(doc, pos, motion, count);
  if (target >= pos) return { from: pos, to: target, lineWise: false };
  return { from: target, to: pos, lineWise: false };
}

// ---------- parse numeric prefix + command from buffer ----------
// Returns { count, rest } where rest is the buffer after consuming digits.
// Note: '0' is a motion, not a count, when buffer is empty.
function parseCount(buf) {
  let i = 0;
  while (i < buf.length && buf.charCodeAt(i) >= 0x30 && buf.charCodeAt(i) <= 0x39) {
    if (i === 0 && buf[i] === '0') break;
    i++;
  }
  const n = i === 0 ? 1 : parseInt(buf.slice(0, i), 10);
  return { count: n, rest: buf.slice(i) };
}

// ---------- main step ----------

function step(input) {
  const { state, mode, key, registers } = input;
  const buffer = (input.buffer || '') + (key.length === 1 ? key : '');
  const doc = state.doc;
  const pos = state.selection.head;

  // --- INSERT MODE ---
  if (mode === 'insert') {
    if (key === 'Escape') {
      // Move cursor back one char (vim semantics), but not past line start.
      const newPos = pos > 0 && doc[pos - 1] !== '\n' ? pos - 1 : pos;
      return { kind: 'mode', to: 'normal', buffer: '', moveTo: newPos };
    }
    return null; // let editor handle native input
  }

  // --- VISUAL MODE (char-wise + line-wise) ---
  if (mode === 'visual' || mode === 'visual-line') {
    if (key === 'Escape' || (key === 'v' && mode === 'visual') || (key === 'V' && mode === 'visual-line')) {
      return { kind: 'mode', to: 'normal', buffer: '' };
    }
    // Switch between visual and visual-line
    if (key === 'v' && mode === 'visual-line') return { kind: 'mode', to: 'visual', buffer: '' };
    if (key === 'V' && mode === 'visual') return { kind: 'mode', to: 'visual-line', buffer: '' };

    // Motions extend selection — surfaced as 'move'; client maintains anchor.
    const parsed = parseCount(buffer);
    const m = parsed.rest;
    if (m === 'h' || m === 'l' || m === 'j' || m === 'k' || m === 'w' || m === 'b' || m === 'e' || m === '0' || m === '^' || m === '$' || m === 'G') {
      const to = applyMotion(doc, pos, m, parsed.count);
      return { kind: 'move', to, buffer: '' };
    }
    if (m === 'g') return { kind: 'consume', buffer };
    if (m === 'gg') return { kind: 'move', to: 0, buffer: '' };

    // Operators on selection
    if (key === 'd' || key === 'x') {
      const sel = state.selection;
      let from = Math.min(sel.anchor, sel.head);
      let to = Math.max(sel.anchor, sel.head) + (mode === 'visual' ? 1 : 0);
      let lineWise = false;
      if (mode === 'visual-line') {
        from = lineStartOf(doc, from);
        to = lineEndOf(doc, to);
        if (to < doc.length) to++;
        lineWise = true;
      }
      return { kind: 'delete', from, to, buffer: '', register: '"', lineWise, exitMode: 'normal' };
    }
    if (key === 'y') {
      const sel = state.selection;
      let from = Math.min(sel.anchor, sel.head);
      let to = Math.max(sel.anchor, sel.head) + (mode === 'visual' ? 1 : 0);
      let lineWise = false;
      if (mode === 'visual-line') {
        from = lineStartOf(doc, from);
        to = lineEndOf(doc, to);
        if (to < doc.length) to++;
        lineWise = true;
      }
      return { kind: 'yank', text: doc.slice(from, to), buffer: '', lineWise, exitMode: 'normal' };
    }
    return { kind: 'consume', buffer: '' };
  }

  // --- NORMAL MODE ---

  // Mode entries
  if (buffer === 'i') return { kind: 'mode', to: 'insert', buffer: '' };
  if (buffer === 'a') {
    const newPos = doc[pos] === '\n' || pos >= doc.length ? pos : pos + 1;
    return { kind: 'mode', to: 'insert', buffer: '', moveTo: newPos };
  }
  if (buffer === 'I') {
    const ls = lineStartOf(doc, pos);
    const le = lineEndOf(doc, ls);
    let i = ls;
    while (i < le && (doc[i] === ' ' || doc[i] === '\t')) i++;
    return { kind: 'mode', to: 'insert', buffer: '', moveTo: i };
  }
  if (buffer === 'A') {
    const le = lineEndOf(doc, pos);
    return { kind: 'mode', to: 'insert', buffer: '', moveTo: le };
  }
  if (buffer === 'o') {
    const le = lineEndOf(doc, pos);
    return { kind: 'insert', at: le, text: '\n', buffer: '', enterInsert: true, moveTo: le + 1 };
  }
  if (buffer === 'O') {
    const ls = lineStartOf(doc, pos);
    return { kind: 'insert', at: ls, text: '\n', buffer: '', enterInsert: true, moveTo: ls };
  }
  if (buffer === 'v') return { kind: 'mode', to: 'visual', buffer: '', anchor: pos };
  if (buffer === 'V') return { kind: 'mode', to: 'visual-line', buffer: '', anchor: pos };

  // Search / ex
  if (buffer === '/') return { kind: 'search-open', buffer: '' };
  if (buffer === ':') return { kind: 'ex-open', buffer: '' };

  // Undo
  if (buffer === 'u') return { kind: 'undo', buffer: '' };

  // Parse numeric prefix
  const parsed = parseCount(buffer);
  const rest = parsed.rest;
  const count = parsed.count;

  // Pending multi-key sequences
  if (rest === 'g' || rest === 'd' || rest === 'y' || rest === 'r' || rest === 'f' || rest === 'F' || rest === 't' || rest === 'T') {
    return { kind: 'consume', buffer };
  }

  // gg / G
  if (rest === 'gg') return { kind: 'move', to: 0, buffer: '' };
  if (rest === 'G') return { kind: 'move', to: posOfLine(doc, lineCount(doc) - 1), buffer: '' };

  // Single-char motions
  if (rest === 'h' || rest === 'l' || rest === 'j' || rest === 'k' || rest === 'w' || rest === 'b' || rest === 'e' || rest === '0' || rest === '^' || rest === '$') {
    return { kind: 'move', to: applyMotion(doc, pos, rest, count), buffer: '' };
  }

  // x — delete char under cursor
  if (rest === 'x') {
    const c = Math.max(1, count);
    const to = Math.min(doc.length, pos + c);
    return { kind: 'delete', from: pos, to, buffer: '', register: '"', lineWise: false };
  }

  // dd / yy
  if (rest === 'dd') {
    const r = motionRange(doc, pos, 'line', count);
    return { kind: 'delete', from: r.from, to: r.to, buffer: '', register: '"', lineWise: true };
  }
  if (rest === 'yy') {
    const r = motionRange(doc, pos, 'line', count);
    return { kind: 'yank', text: doc.slice(r.from, r.to), buffer: '', lineWise: true };
  }

  // d{motion}, y{motion}, c{motion}
  if (rest.length === 2 && (rest[0] === 'd' || rest[0] === 'y' || rest[0] === 'c')) {
    const op = rest[0];
    const m = rest[1];
    if (m === 'w' || m === 'b' || m === 'e' || m === 'h' || m === 'l' || m === 'j' || m === 'k' || m === '0' || m === '^' || m === '$') {
      const r = motionRange(doc, pos, m, count);
      if (op === 'd') return { kind: 'delete', from: r.from, to: r.to, buffer: '', register: '"', lineWise: false };
      if (op === 'y') return { kind: 'yank', text: doc.slice(r.from, r.to), buffer: '' };
      if (op === 'c') {
        return { kind: 'delete', from: r.from, to: r.to, buffer: '', register: '"', enterInsert: true };
      }
    }
  }

  // r{char}
  if (rest.length === 2 && rest[0] === 'r') {
    return { kind: 'replace', at: pos, text: rest[1], buffer: '' };
  }

  // f/F/t/T {char}
  if (rest.length === 2 && (rest[0] === 'f' || rest[0] === 'F' || rest[0] === 't' || rest[0] === 'T')) {
    const which = rest[0];
    const ch = rest[1];
    const ls = lineStartOf(doc, pos);
    const le = lineEndOf(doc, pos);
    let target = -1;
    if (which === 'f') {
      const i = doc.indexOf(ch, pos + 1);
      if (i !== -1 && i <= le) target = i;
    } else if (which === 'F') {
      const i = doc.lastIndexOf(ch, pos - 1);
      if (i !== -1 && i >= ls) target = i;
    } else if (which === 't') {
      const i = doc.indexOf(ch, pos + 1);
      if (i !== -1 && i <= le) target = i - 1;
    } else if (which === 'T') {
      const i = doc.lastIndexOf(ch, pos - 1);
      if (i !== -1 && i >= ls) target = i + 1;
    }
    if (target >= 0) return { kind: 'move', to: target, buffer: '' };
    return { kind: 'noop', buffer: '' };
  }

  // p / P (paste)
  if (rest === 'p' || rest === 'P') {
    const text = (registers && registers['"']) || '';
    if (!text) return { kind: 'noop', buffer: '' };
    const lineWise = text.endsWith('\n');
    let at;
    if (lineWise) {
      at = rest === 'p' ? (lineEndOf(doc, pos) < doc.length ? lineEndOf(doc, pos) + 1 : doc.length) : lineStartOf(doc, pos);
      // For 'p' at end of doc, prepend a newline.
      if (rest === 'p' && lineEndOf(doc, pos) === doc.length) {
        return { kind: 'paste', at: doc.length, text: '\n' + text.replace(/\n$/, ''), buffer: '', lineWise: true };
      }
    } else {
      at = rest === 'p' ? Math.min(doc.length, pos + 1) : pos;
    }
    return { kind: 'paste', at, text, buffer: '', lineWise, after: rest === 'p' };
  }

  // *: search word under cursor
  if (rest === '*' || rest === '#') {
    const ls = lineStartOf(doc, pos);
    const le = lineEndOf(doc, pos);
    let s = pos;
    let e = pos;
    while (s > ls && isWordChar(doc[s - 1])) s--;
    while (e < le && isWordChar(doc[e])) e++;
    const word = doc.slice(s, e);
    if (!word) return { kind: 'noop', buffer: '' };
    return { kind: 'search', text: word, forward: rest === '*', buffer: '' };
  }

  // Unknown but plausibly-pending? Drop on length > 3.
  if (buffer.length > 3) return { kind: 'noop', buffer: '' };
  return { kind: 'consume', buffer };
}

module.exports = {
  step,
  applyMotion,
  motionRange,
  parseCount,
  // exposed for tests/debug
  lineStartOf,
  lineEndOf,
  lineNumberOf,
  posOfLine,
  lineCount,
  wordForward,
  wordBackward,
  wordEnd,
};
