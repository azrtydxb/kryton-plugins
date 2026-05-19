const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect } = React;
function lineStartOf(doc, pos) {
  if (pos <= 0) return 0;
  const i = doc.lastIndexOf("\n", pos - 1);
  return i === -1 ? 0 : i + 1;
}
function lineEndOf(doc, pos) {
  const i = doc.indexOf("\n", pos);
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
function isWordChar(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}
function classOf(ch) {
  if (ch === void 0 || ch === "\n") return "nl";
  if (/\s/.test(ch)) return "ws";
  if (isWordChar(ch)) return "w";
  return "p";
}
function wordForward(doc, pos) {
  const n = doc.length;
  let i = pos;
  const startClass = classOf(doc[i]);
  while (i < n && classOf(doc[i]) === startClass && startClass !== "ws") i++;
  while (i < n && (doc[i] === " " || doc[i] === "	" || doc[i] === "\n")) i++;
  return Math.min(i, n);
}
function wordBackward(doc, pos) {
  let i = pos;
  if (i > 0) i--;
  while (i > 0 && (doc[i] === " " || doc[i] === "	" || doc[i] === "\n")) i--;
  const cls = classOf(doc[i]);
  while (i > 0 && classOf(doc[i - 1]) === cls && cls !== "ws") i--;
  return Math.max(i, 0);
}
function wordEnd(doc, pos) {
  const n = doc.length;
  let i = pos;
  if (i < n - 1) i++;
  while (i < n && (doc[i] === " " || doc[i] === "	" || doc[i] === "\n")) i++;
  const cls = classOf(doc[i]);
  while (i < n - 1 && classOf(doc[i + 1]) === cls && cls !== "ws") i++;
  return Math.min(i, n);
}
function applyMotion(doc, pos, motion, count) {
  let p = pos;
  const c = Math.max(1, count || 1);
  for (let k = 0; k < c; k++) {
    switch (motion) {
      case "h":
        if (p > 0 && doc[p - 1] !== "\n") p--;
        break;
      case "l":
        if (p < doc.length && doc[p] !== "\n") p++;
        if (p < doc.length && doc[p] === "\n") p--;
        break;
      case "j": {
        const col = p - lineStartOf(doc, p);
        const nextLine = lineNumberOf(doc, p) + 1;
        if (nextLine >= lineCount(doc)) {
          p = lineEndOf(doc, p);
          break;
        }
        const ls = posOfLine(doc, nextLine);
        p = Math.min(ls + col, lineEndOf(doc, ls));
        break;
      }
      case "k": {
        const col = p - lineStartOf(doc, p);
        const prevLine = lineNumberOf(doc, p) - 1;
        if (prevLine < 0) {
          p = lineStartOf(doc, p);
          break;
        }
        const ls = posOfLine(doc, prevLine);
        p = Math.min(ls + col, lineEndOf(doc, ls));
        break;
      }
      case "w":
        p = wordForward(doc, p);
        break;
      case "b":
        p = wordBackward(doc, p);
        break;
      case "e":
        p = wordEnd(doc, p);
        break;
      case "0":
        p = lineStartOf(doc, p);
        break;
      case "^": {
        const ls = lineStartOf(doc, p);
        const le = lineEndOf(doc, ls);
        let i = ls;
        while (i < le && (doc[i] === " " || doc[i] === "	")) i++;
        p = i;
        break;
      }
      case "$":
        p = lineEndOf(doc, p);
        break;
      case "gg":
        p = 0;
        break;
      case "G":
        p = posOfLine(doc, Math.max(0, lineCount(doc) - 1));
        break;
    }
  }
  return p;
}
function motionRange(doc, pos, motion, count) {
  if (motion === "line") {
    const ls = lineStartOf(doc, pos);
    let le = lineEndOf(doc, pos);
    if (le < doc.length) le++;
    else if (ls > 0) return { from: ls - 1, to: le, lineWise: true };
    return { from: ls, to: le, lineWise: true };
  }
  const target = applyMotion(doc, pos, motion, count);
  if (target >= pos) return { from: pos, to: target, lineWise: false };
  return { from: target, to: pos, lineWise: false };
}
function runEx(cmdStr) {
  let s = (cmdStr || "").trim();
  if (s.startsWith(":")) s = s.slice(1).trim();
  if (!s) return { kind: "noop" };
  if (s === "w" || s === "write") return { kind: "save" };
  if (s === "q" || s === "quit") return { kind: "close" };
  if (s === "wq" || s === "x" || s === "wq!") return { kind: "save-and-close" };
  if (s === "set number" || s === "set nu") {
    return { kind: "set-option", option: "lineNumbers", value: true };
  }
  if (s === "set nonumber" || s === "set nonu") {
    return { kind: "set-option", option: "lineNumbers", value: false };
  }
  return { kind: "unknown", cmd: s };
}
function parseCount(buf) {
  let i = 0;
  while (i < buf.length && buf.charCodeAt(i) >= 48 && buf.charCodeAt(i) <= 57) {
    if (i === 0 && buf[i] === "0") break;
    i++;
  }
  return { count: i === 0 ? 1 : parseInt(buf.slice(0, i), 10), rest: buf.slice(i) };
}
function step(input) {
  const { state, mode, key, registers } = input;
  const buffer = (input.buffer || "") + (key.length === 1 ? key : "");
  const doc = state.doc;
  const pos = state.selection.head;
  if (mode === "insert") {
    if (key === "Escape") {
      const newPos = pos > 0 && doc[pos - 1] !== "\n" ? pos - 1 : pos;
      return { kind: "mode", to: "normal", buffer: "", moveTo: newPos };
    }
    return null;
  }
  if (mode === "visual" || mode === "visual-line") {
    if (key === "Escape" || key === "v" && mode === "visual" || key === "V" && mode === "visual-line") {
      return { kind: "mode", to: "normal", buffer: "" };
    }
    if (key === "v" && mode === "visual-line") return { kind: "mode", to: "visual", buffer: "" };
    if (key === "V" && mode === "visual") return { kind: "mode", to: "visual-line", buffer: "" };
    const parsed2 = parseCount(buffer);
    const m = parsed2.rest;
    if (m === "h" || m === "l" || m === "j" || m === "k" || m === "w" || m === "b" || m === "e" || m === "0" || m === "^" || m === "$" || m === "G") {
      return { kind: "move", to: applyMotion(doc, pos, m, parsed2.count), buffer: "" };
    }
    if (m === "g") return { kind: "consume", buffer };
    if (m === "gg") return { kind: "move", to: 0, buffer: "" };
    if (key === "d" || key === "x") {
      const sel = state.selection;
      let from = Math.min(sel.anchor, sel.head);
      let to = Math.max(sel.anchor, sel.head) + (mode === "visual" ? 1 : 0);
      let lineWise = false;
      if (mode === "visual-line") {
        from = lineStartOf(doc, from);
        to = lineEndOf(doc, to);
        if (to < doc.length) to++;
        lineWise = true;
      }
      return { kind: "delete", from, to, buffer: "", register: '"', lineWise, exitMode: "normal" };
    }
    if (key === "y") {
      const sel = state.selection;
      let from = Math.min(sel.anchor, sel.head);
      let to = Math.max(sel.anchor, sel.head) + (mode === "visual" ? 1 : 0);
      let lineWise = false;
      if (mode === "visual-line") {
        from = lineStartOf(doc, from);
        to = lineEndOf(doc, to);
        if (to < doc.length) to++;
        lineWise = true;
      }
      return { kind: "yank", text: doc.slice(from, to), buffer: "", lineWise, exitMode: "normal" };
    }
    return { kind: "consume", buffer: "" };
  }
  if (buffer === "i") return { kind: "mode", to: "insert", buffer: "" };
  if (buffer === "a") {
    const newPos = doc[pos] === "\n" || pos >= doc.length ? pos : pos + 1;
    return { kind: "mode", to: "insert", buffer: "", moveTo: newPos };
  }
  if (buffer === "I") {
    const ls = lineStartOf(doc, pos);
    const le = lineEndOf(doc, ls);
    let i = ls;
    while (i < le && (doc[i] === " " || doc[i] === "	")) i++;
    return { kind: "mode", to: "insert", buffer: "", moveTo: i };
  }
  if (buffer === "A") return { kind: "mode", to: "insert", buffer: "", moveTo: lineEndOf(doc, pos) };
  if (buffer === "o") {
    const le = lineEndOf(doc, pos);
    return { kind: "insert", at: le, text: "\n", buffer: "", enterInsert: true, moveTo: le + 1 };
  }
  if (buffer === "O") {
    const ls = lineStartOf(doc, pos);
    return { kind: "insert", at: ls, text: "\n", buffer: "", enterInsert: true, moveTo: ls };
  }
  if (buffer === "v") return { kind: "mode", to: "visual", buffer: "", anchor: pos };
  if (buffer === "V") return { kind: "mode", to: "visual-line", buffer: "", anchor: pos };
  if (buffer === "/") return { kind: "search-open", buffer: "" };
  if (buffer === ":") return { kind: "ex-open", buffer: "" };
  if (buffer === "u") return { kind: "undo", buffer: "" };
  const parsed = parseCount(buffer);
  const rest = parsed.rest;
  const count = parsed.count;
  if (rest === "g" || rest === "d" || rest === "y" || rest === "r" || rest === "f" || rest === "F" || rest === "t" || rest === "T") {
    return { kind: "consume", buffer };
  }
  if (rest === "gg") return { kind: "move", to: 0, buffer: "" };
  if (rest === "G") return { kind: "move", to: posOfLine(doc, lineCount(doc) - 1), buffer: "" };
  if (rest === "h" || rest === "l" || rest === "j" || rest === "k" || rest === "w" || rest === "b" || rest === "e" || rest === "0" || rest === "^" || rest === "$") {
    return { kind: "move", to: applyMotion(doc, pos, rest, count), buffer: "" };
  }
  if (rest === "x") {
    const c = Math.max(1, count);
    return { kind: "delete", from: pos, to: Math.min(doc.length, pos + c), buffer: "", register: '"', lineWise: false };
  }
  if (rest === "dd") {
    const r = motionRange(doc, pos, "line", count);
    return { kind: "delete", from: r.from, to: r.to, buffer: "", register: '"', lineWise: true };
  }
  if (rest === "yy") {
    const r = motionRange(doc, pos, "line", count);
    return { kind: "yank", text: doc.slice(r.from, r.to), buffer: "", lineWise: true };
  }
  if (rest.length === 2 && (rest[0] === "d" || rest[0] === "y" || rest[0] === "c")) {
    const op = rest[0];
    const m = rest[1];
    if (m === "w" || m === "b" || m === "e" || m === "h" || m === "l" || m === "j" || m === "k" || m === "0" || m === "^" || m === "$") {
      const r = motionRange(doc, pos, m, count);
      if (op === "d") return { kind: "delete", from: r.from, to: r.to, buffer: "", register: '"', lineWise: false };
      if (op === "y") return { kind: "yank", text: doc.slice(r.from, r.to), buffer: "" };
      if (op === "c") return { kind: "delete", from: r.from, to: r.to, buffer: "", register: '"', enterInsert: true };
    }
  }
  if (rest.length === 2 && rest[0] === "r") {
    return { kind: "replace", at: pos, text: rest[1], buffer: "" };
  }
  if (rest.length === 2 && (rest[0] === "f" || rest[0] === "F" || rest[0] === "t" || rest[0] === "T")) {
    const which = rest[0];
    const ch = rest[1];
    const ls = lineStartOf(doc, pos);
    const le = lineEndOf(doc, pos);
    let target = -1;
    if (which === "f") {
      const i = doc.indexOf(ch, pos + 1);
      if (i !== -1 && i <= le) target = i;
    } else if (which === "F") {
      const i = doc.lastIndexOf(ch, pos - 1);
      if (i !== -1 && i >= ls) target = i;
    } else if (which === "t") {
      const i = doc.indexOf(ch, pos + 1);
      if (i !== -1 && i <= le) target = i - 1;
    } else if (which === "T") {
      const i = doc.lastIndexOf(ch, pos - 1);
      if (i !== -1 && i >= ls) target = i + 1;
    }
    if (target >= 0) return { kind: "move", to: target, buffer: "" };
    return { kind: "noop", buffer: "" };
  }
  if (rest === "p" || rest === "P") {
    const text = registers && registers['"'] || "";
    if (!text) return { kind: "noop", buffer: "" };
    const lineWise = text.endsWith("\n");
    let at;
    if (lineWise) {
      if (rest === "p" && lineEndOf(doc, pos) === doc.length) {
        return { kind: "paste", at: doc.length, text: "\n" + text.replace(/\n$/, ""), buffer: "", lineWise: true };
      }
      at = rest === "p" ? lineEndOf(doc, pos) + 1 : lineStartOf(doc, pos);
    } else {
      at = rest === "p" ? Math.min(doc.length, pos + 1) : pos;
    }
    return { kind: "paste", at, text, buffer: "", lineWise, after: rest === "p" };
  }
  if (rest === "*" || rest === "#") {
    const ls = lineStartOf(doc, pos);
    const le = lineEndOf(doc, pos);
    let s = pos;
    let e = pos;
    while (s > ls && isWordChar(doc[s - 1])) s--;
    while (e < le && isWordChar(doc[e])) e++;
    const word = doc.slice(s, e);
    if (!word) return { kind: "noop", buffer: "" };
    return { kind: "search", text: word, forward: rest === "*", buffer: "" };
  }
  if (buffer.length > 3) return { kind: "noop", buffer: "" };
  return { kind: "consume", buffer };
}
function txMove(to) {
  return { ops: [], selection: { anchor: to, head: to } };
}
function txDelete(from, to, selectAt) {
  const head = selectAt ?? from;
  return { ops: [{ kind: "delete", from, to }], selection: { anchor: head, head } };
}
function txInsert(at, text, selectAt) {
  const head = selectAt ?? at + text.length;
  return { ops: [{ kind: "insert", at, text }], selection: { anchor: head, head } };
}
function txReplace(at, text) {
  return {
    ops: [{ kind: "replace", from: at, to: at + 1, text }],
    selection: { anchor: at, head: at }
  };
}
function activate(api) {
  let enabled = true;
  let lineNumbers = false;
  let mode = "normal";
  let buffer = "";
  let visualAnchor = null;
  const registers = { '"': "" };
  let lastSearch = null;
  let modeListeners = [];
  function broadcast() {
    modeListeners.forEach((fn) => fn(mode));
  }
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    broadcast();
  }
  (async () => {
    try {
      const stored = await api.storage.get("enabled");
      if (stored === false) enabled = false;
      const ln = await api.storage.get("lineNumbers");
      if (ln === true) {
        lineNumbers = true;
        api.editor.setOption("lineNumbers", true);
      }
    } catch {
    }
  })();
  function onKeyDown(e, state) {
    if (!enabled) return null;
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    const key = e.key;
    if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") return null;
    const engineState = {
      doc: state.doc,
      selection: {
        head: state.selection.head,
        anchor: mode === "visual" || mode === "visual-line" ? visualAnchor ?? state.selection.anchor : state.selection.anchor
      }
    };
    const result = step({
      state: engineState,
      mode,
      buffer,
      key,
      registers,
      lastSearch
    });
    if (result === null) {
      return null;
    }
    buffer = result.buffer;
    switch (result.kind) {
      case "consume":
        return "prevent-default";
      case "noop":
        return "prevent-default";
      case "mode": {
        setMode(result.to);
        if (result.to === "visual" || result.to === "visual-line") {
          visualAnchor = result.anchor ?? state.selection.head;
        } else {
          visualAnchor = null;
        }
        if (result.moveTo !== void 0) {
          return { ops: [], selection: { anchor: result.moveTo, head: result.moveTo } };
        }
        return "prevent-default";
      }
      case "move": {
        if (mode === "visual" || mode === "visual-line") {
          return { ops: [], selection: { anchor: visualAnchor ?? result.to, head: result.to } };
        }
        return txMove(result.to);
      }
      case "delete": {
        if (result.register) registers['"'] = state.doc.slice(result.from, result.to);
        const selectAt = result.from;
        const tx = txDelete(result.from, result.to, selectAt);
        if (result.exitMode) {
          setMode(result.exitMode);
          visualAnchor = null;
        }
        if (result.enterInsert) setMode("insert");
        return tx;
      }
      case "yank": {
        registers['"'] = result.text;
        if (result.exitMode) {
          setMode(result.exitMode);
          visualAnchor = null;
        }
        return { ops: [], selection: { anchor: state.selection.head, head: state.selection.head } };
      }
      case "insert": {
        const moveTo = result.moveTo ?? result.at + result.text.length;
        const tx = txInsert(result.at, result.text, moveTo);
        if (result.enterInsert) setMode("insert");
        return tx;
      }
      case "replace":
        return txReplace(result.at, result.text);
      case "undo":
        try {
          const tgt = e.target || document.activeElement || document.body;
          tgt.dispatchEvent(new KeyboardEvent("keydown", {
            key: "z",
            code: "KeyZ",
            ctrlKey: !navigator.platform.includes("Mac"),
            metaKey: navigator.platform.includes("Mac"),
            bubbles: true
          }));
        } catch {
        }
        return "prevent-default";
      case "paste": {
        const head = result.after ? result.at + (result.lineWise ? 0 : result.text.length - 1) : result.at + (result.lineWise ? 0 : result.text.length - 1);
        return txInsert(result.at, result.text, Math.max(0, head));
      }
      case "search-open":
        openSearchPrompt(api);
        return "prevent-default";
      case "ex-open":
        openExPrompt(api, (v) => {
          lineNumbers = v;
          api.storage.set("lineNumbers", v).catch(() => {
          });
        });
        return "prevent-default";
      case "search": {
        lastSearch = result.text;
        const idx = findNext(state.doc, state.selection.head, result.text, result.forward);
        if (idx >= 0) return txMove(idx);
        return "prevent-default";
      }
    }
    return "prevent-default";
  }
  api.editor.registerPlugin({
    name: "vim-mode",
    onKeyDown
  });
  function useModeListener() {
    const [m, setLocal] = useState(mode);
    useEffect(() => {
      const fn = (next) => setLocal(next);
      modeListeners.push(fn);
      return () => {
        modeListeners = modeListeners.filter((f) => f !== fn);
      };
    }, []);
    return m;
  }
  function ModeIndicator() {
    const m = useModeListener();
    if (!enabled) return h("div", { className: "text-xs font-mono px-2 text-gray-500" }, "-- VIM OFF --");
    const label = m === "insert" ? "-- INSERT --" : m === "visual" ? "-- VISUAL --" : m === "visual-line" ? "-- VISUAL LINE --" : "-- NORMAL --";
    const color = m === "insert" ? "text-green-500" : m === "visual" || m === "visual-line" ? "text-orange-500" : "text-violet-500";
    return h("div", { className: `font-semibold text-xs font-mono px-2 ${color}` }, label);
  }
  api.ui.registerStatusBarItem(ModeIndicator, {
    id: "vim-mode-indicator",
    position: "left",
    order: 1
  });
  function VimToggle() {
    const m = useModeListener();
    void m;
    const [on, setOn] = useState(enabled);
    function toggle() {
      enabled = !enabled;
      setOn(enabled);
      api.storage.set("enabled", enabled).catch(() => {
      });
      if (!enabled) {
        setMode("normal");
        buffer = "";
      }
      broadcast();
    }
    return h(
      "div",
      { className: "flex items-center gap-1.5 mr-2" },
      h("span", { className: "text-xs text-gray-400" }, "Vim"),
      h(
        "button",
        {
          onClick: toggle,
          className: "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " + (on ? "bg-violet-500" : "bg-gray-600"),
          title: on ? "Disable Vim mode" : "Enable Vim mode"
        },
        h("span", {
          className: "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform " + (on ? "translate-x-4" : "translate-x-1")
        })
      )
    );
  }
  api.ui.registerEditorToolbarButton(VimToggle, { id: "vim-toggle", order: 100 });
  api.commands.register({
    id: "vim:toggle",
    name: "Toggle Vim mode",
    execute: () => {
      enabled = !enabled;
      api.storage.set("enabled", enabled).catch(() => {
      });
      if (!enabled) {
        setMode("normal");
        buffer = "";
      }
      broadcast();
      api.notify.info(`Vim mode ${enabled ? "enabled" : "disabled"}`);
    }
  });
  api.commands.register({
    id: "vim:toggle-line-numbers",
    name: "Toggle line numbers (vim)",
    execute: () => {
      lineNumbers = !lineNumbers;
      api.storage.set("lineNumbers", lineNumbers).catch(() => {
      });
      api.editor.setOption("lineNumbers", lineNumbers);
      api.notify.info(`Line numbers ${lineNumbers ? "on" : "off"}`);
    }
  });
}
function openExPrompt(api, setLineNumbers) {
  promptOverlay(":", async (raw) => {
    const result = runEx(raw);
    switch (result.kind) {
      case "noop":
        return;
      case "save": {
        try {
          await api.notes.saveCurrent();
          api.notify.success("Saved");
        } catch (err) {
          api.notify.error(`Save failed: ${err.message ?? String(err)}`);
        }
        return;
      }
      case "close": {
        try {
          api.ui.closePane();
        } catch (err) {
          api.notify.error(`Close failed: ${err.message ?? String(err)}`);
        }
        return;
      }
      case "save-and-close": {
        try {
          await api.notes.saveCurrent();
        } catch (err) {
          api.notify.error(`Save failed: ${err.message ?? String(err)}`);
          return;
        }
        try {
          api.ui.closePane();
        } catch (err) {
          api.notify.error(`Close failed: ${err.message ?? String(err)}`);
        }
        return;
      }
      case "set-option": {
        if (result.option === "lineNumbers") {
          api.editor.setOption("lineNumbers", result.value);
          setLineNumbers(result.value);
        } else {
          api.editor.setOption(result.option, result.value);
        }
        return;
      }
      case "unknown":
        api.notify.error(`Unknown command: ${result.cmd}`);
        return;
    }
  });
}
function openSearchPrompt(api) {
  promptOverlay("/", async (query) => {
    if (!query) return;
    document.dispatchEvent(new CustomEvent("vim:search", { detail: query }));
    api.notify.info(`Search: ${query}`);
  });
}
function promptOverlay(prefix, onSubmit) {
  if (typeof document === "undefined") return;
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;left:0;right:0;bottom:0;background:#1e1e2e;color:#cdd6f4;padding:6px 10px;font-family:monospace;font-size:13px;z-index:99999;display:flex;align-items:center;gap:6px;border-top:1px solid #313244;";
  const label = document.createElement("span");
  label.textContent = prefix;
  const input = document.createElement("input");
  input.style.cssText = "flex:1;background:transparent;border:none;outline:none;color:inherit;font:inherit;";
  overlay.appendChild(label);
  overlay.appendChild(input);
  document.body.appendChild(overlay);
  input.focus();
  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value;
      close();
      onSubmit(v);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
}
function findNext(doc, from, needle, forward) {
  if (!needle) return -1;
  if (forward) {
    const i = doc.indexOf(needle, from + 1);
    if (i !== -1) return i;
    return doc.indexOf(needle);
  } else {
    const i = doc.lastIndexOf(needle, Math.max(0, from - 1));
    if (i !== -1) return i;
    return doc.lastIndexOf(needle);
  }
}
function deactivate() {
}
export {
  activate,
  deactivate
};
