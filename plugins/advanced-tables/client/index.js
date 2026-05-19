const { React } = window.__krytonPluginDeps;
const { createElement: h, useEffect, useRef } = React;
function parseTable(text) {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return null;
  return lines.map((line) => {
    const trimmed = line.trim().replace(/^\||\|$/g, "");
    return trimmed.split("|").map((cell) => cell.trim());
  });
}
function isSeparatorRow(row) {
  return row.every((cell) => /^:?-+:?$/.test(cell.trim()) || cell.trim() === "");
}
function formatTable(rows) {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return padded;
  });
  const colWidths = Array(colCount).fill(3);
  for (const row of normalized) {
    if (isSeparatorRow(row)) continue;
    row.forEach((cell, i) => {
      if (cell.length > colWidths[i]) colWidths[i] = cell.length;
    });
  }
  return normalized.map((row) => {
    const cells = row.map((cell, i) => {
      if (isSeparatorRow(row)) {
        const c = cell.trim();
        const leftColon = c.startsWith(":");
        const rightColon = c.endsWith(":");
        const dashes = "-".repeat(
          colWidths[i] - (leftColon ? 1 : 0) - (rightColon ? 1 : 0)
        );
        return (leftColon ? ":" : "") + dashes + (rightColon ? ":" : "");
      }
      return cell.padEnd(colWidths[i]);
    });
    return "| " + cells.join(" | ") + " |";
  }).join("\n");
}
function formatTableAtCursor(content, cursorPos) {
  const lines = content.split("\n");
  let charCount = 0;
  let cursorLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= cursorPos) {
      cursorLine = i;
      break;
    }
    charCount += lines[i].length + 1;
  }
  if (cursorLine === -1) cursorLine = lines.length - 1;
  if (!lines[cursorLine] || !lines[cursorLine].trim().startsWith("|")) return null;
  let tableStart = cursorLine;
  while (tableStart > 0 && lines[tableStart - 1].trim().startsWith("|")) tableStart--;
  let tableEnd = cursorLine;
  while (tableEnd < lines.length - 1 && lines[tableEnd + 1].trim().startsWith("|")) tableEnd++;
  const tableLines = lines.slice(tableStart, tableEnd + 1);
  const parsed = parseTable(tableLines.join("\n"));
  if (!parsed) return null;
  const formatted = formatTable(parsed);
  const beforeTable = lines.slice(0, tableStart).join("\n");
  const tableFrom = tableStart === 0 ? 0 : beforeTable.length + 1;
  const oldTableText = tableLines.join("\n");
  const tableTo = tableFrom + oldTableText.length;
  const newLines = [
    ...lines.slice(0, tableStart),
    ...formatted.split("\n"),
    ...lines.slice(tableEnd + 1)
  ];
  const newContent = newLines.join("\n");
  const cursorInTable = cursorPos - tableFrom;
  const newCursorPos = Math.min(tableFrom + cursorInTable, tableFrom + formatted.length);
  return {
    newContent,
    cursorOffset: newCursorPos - cursorPos,
    tableFrom,
    tableTo,
    formatted
  };
}
function readEditor(api) {
  const st = api.editor.getActiveState();
  if (!st || typeof st.doc !== "string") return null;
  const sel = st.selection;
  const caret = sel && typeof sel.head === "number" ? sel.head : Math.floor(st.doc.length / 2);
  return { content: st.doc, caret };
}
function runFormat(api, fallbackContent) {
  const fromEditor = readEditor(api);
  const content = fromEditor?.content ?? fallbackContent;
  const caret = fromEditor?.caret ?? 0;
  if (content === null || content === void 0) {
    api.notify.info("No note is currently open.");
    return;
  }
  const result = formatTableAtCursor(content, caret);
  if (!result) {
    api.notify.info("No Markdown table found at cursor.");
    return;
  }
  if (fromEditor) {
    const newCaret = Math.max(0, caret + result.cursorOffset);
    const tr = {
      ops: [
        {
          kind: "replace",
          from: result.tableFrom,
          to: result.tableTo,
          text: result.formatted
        }
      ],
      selection: { anchor: newCaret, head: newCaret }
    };
    api.editor.dispatch(tr);
    api.notify.success("Table formatted.");
  } else {
    api.notify.info("Table formatting requires the editor to be focused.");
  }
}
function activate(api) {
  api.commands.register({
    id: "advanced-tables.format",
    name: "Format Table",
    shortcut: "Ctrl+Shift+T",
    execute() {
      runFormat(api, null);
    }
  });
  function FormatTableButton() {
    const note = api.context.useCurrentNote();
    const noteRef = useRef(null);
    useEffect(() => {
      noteRef.current = note ? note.content : null;
    }, [note]);
    return h(
      "button",
      {
        onClick() {
          runFormat(api, noteRef.current);
        },
        title: "Format Table (Ctrl+Shift+T)",
        className: "px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors font-mono"
      },
      "TBL"
    );
  }
  api.ui.registerEditorToolbarButton(FormatTableButton, {
    id: "advanced-tables-format",
    order: 50
  });
}
function deactivate() {
}
export {
  activate,
  deactivate
};
