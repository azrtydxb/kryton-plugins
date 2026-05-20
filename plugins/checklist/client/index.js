const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;
const CHECKBOX_RE = /^[-*]\s+\[( |x)\]\s+(.+)$/i;
function parseCheckboxes(content) {
  const lines = content.split("\n");
  const items = [];
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    if (fenceChar !== null) continue;
    const match = CHECKBOX_RE.exec(line.trim());
    if (!match) continue;
    items.push({
      text: match[2].trim(),
      checked: match[1].toLowerCase() === "x",
      lineIndex: i
    });
  }
  return items;
}
function noteLabel(path) {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? path;
  return filename.replace(/\.md$/i, "");
}
function activate(api) {
  function ChecklistPanel() {
    const showCompletedSetting = api.context.usePluginSettings("showCompleted");
    const showCompleted = showCompletedSetting !== false;
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchChecklists = useCallback(() => {
      setLoading(true);
      setError(null);
      api.api.fetch("/notes").then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))).then((results) => {
        if (!Array.isArray(results)) return [];
        return results.map((note) => ({
          path: note.path,
          items: parseCheckboxes(note.content ?? "")
        })).filter((n) => n.items.length > 0);
      }).then((parsed) => {
        setNotes(parsed);
        setLoading(false);
      }).catch((err) => {
        setError(err.message ?? "Failed to load checklists");
        setLoading(false);
      });
    }, []);
    useEffect(() => {
      fetchChecklists();
    }, [fetchChecklists]);
    const handleNavigate = useCallback(async (path) => {
      await api.notes.openByPath(path);
    }, []);
    const visibleNotes = notes.map((note) => ({
      ...note,
      items: showCompleted ? note.items : note.items.filter((i) => !i.checked)
    })).filter((note) => note.items.length > 0);
    const totalCount = visibleNotes.reduce(
      (acc, n) => acc + n.items.length,
      0
    );
    const header = h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 12px",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 10.5,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--fg-3)"
        }
      },
      h("span", null, "Checklist"),
      h(
        "span",
        { style: { display: "flex", alignItems: "center", gap: 6 } },
        h("span", { style: { color: "var(--fg-4)" } }, String(totalCount)),
        h("button", {
          onClick: fetchChecklists,
          title: "Refresh",
          "aria-label": "Refresh checklist",
          style: {
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "var(--fg-4)",
            fontSize: 11
          }
        }, "\u21BB")
      )
    );
    if (loading) {
      return h(
        "div",
        { className: "flex flex-col" },
        header,
        h("div", {
          style: { padding: "6px 12px 10px", color: "var(--fg-4)", fontSize: 11.5, fontStyle: "italic" }
        }, "Loading checklists\u2026")
      );
    }
    if (error) {
      return h(
        "div",
        { className: "flex flex-col" },
        header,
        h("div", {
          style: { padding: "6px 12px 10px", color: "var(--accent-error, crimson)", fontSize: 11.5 }
        }, "Error: " + error)
      );
    }
    if (visibleNotes.length === 0) {
      return h(
        "div",
        { className: "flex flex-col" },
        header,
        h("div", {
          style: { padding: "6px 12px 10px", color: "var(--fg-4)", fontSize: 11.5, fontStyle: "italic" }
        }, notes.length === 0 ? "No task-list items in any note." : "All items completed.")
      );
    }
    return h(
      "div",
      { className: "flex flex-col h-full" },
      header,
      h(
        "ul",
        { className: "flex-1 overflow-y-auto py-1" },
        visibleNotes.map(
          (note) => h(
            "li",
            { key: note.path, className: "mb-2" },
            // Note header
            h("button", {
              onClick: () => handleNavigate(note.path),
              className: "w-full text-left px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 uppercase tracking-wide truncate transition-colors",
              title: note.path
            }, noteLabel(note.path)),
            // Checklist items
            h(
              "ul",
              null,
              note.items.map(
                (item, idx) => h(
                  "li",
                  { key: `${note.path}-${idx}-${item.lineIndex}` },
                  h(
                    "button",
                    {
                      onClick: () => handleNavigate(note.path),
                      className: "w-full text-left flex items-start gap-2 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group",
                      title: `${noteLabel(note.path)}: ${item.text}`
                    },
                    h(
                      "span",
                      {
                        className: "mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded border " + (item.checked ? "bg-violet-500 border-violet-500 text-white flex items-center justify-center" : "border-gray-400 dark:border-gray-500")
                      },
                      item.checked ? h("span", { className: "text-[9px] leading-none" }, "\u2713") : null
                    ),
                    h("span", {
                      className: "text-sm flex-1 min-w-0 break-words " + (item.checked ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300")
                    }, item.text)
                  )
                )
              )
            )
          )
        )
      )
    );
  }
  api.ui.registerSidebarPanel(ChecklistPanel, {
    id: "checklist",
    title: "Checklist",
    icon: "check-square",
    order: 30
  });
}
function deactivate() {
}
export {
  activate,
  deactivate
};
