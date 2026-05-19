const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;
const STORAGE_PREFIX = "kryton-recent-files-";
function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}
function loadRecent(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveRecent(userId, items) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
  }
}
function addRecent(userId, path, max) {
  const items = loadRecent(userId).filter((p) => p !== path);
  items.unshift(path);
  const trimmed = items.slice(0, max);
  saveRecent(userId, trimmed);
  return trimmed;
}
function noteLabel(path) {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? path;
  return filename.replace(/\.md$/i, "");
}
function notePath(path) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}
function activate(api) {
  function RecentFilesPanel() {
    const user = api.context.useCurrentUser();
    const currentNote = api.context.useCurrentNote();
    const rawMax = api.context.usePluginSettings("maxItems");
    const maxItems = typeof rawMax === "number" && rawMax > 0 ? rawMax : 20;
    const userId = user?.id ?? "anonymous";
    const [items, setItems] = useState(() => loadRecent(userId));
    useEffect(() => {
      if (!currentNote?.path) return;
      const updated = addRecent(userId, currentNote.path, maxItems);
      setItems(updated);
    }, [currentNote?.path, userId, maxItems]);
    const handleNavigate = useCallback((path) => {
      api.notes.openByPath(path).catch(() => {
      });
    }, []);
    const handleClear = useCallback(() => {
      saveRecent(userId, []);
      setItems([]);
    }, [userId]);
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
      h("span", null, "Recent"),
      h("span", { style: { color: "var(--fg-4)" } }, String(items.length))
    );
    if (items.length === 0) {
      return h(
        "div",
        { className: "flex flex-col" },
        header,
        h("div", {
          style: {
            padding: "6px 12px 10px",
            color: "var(--fg-4)",
            fontSize: 11.5,
            fontStyle: "italic"
          }
        }, "No recently opened files.")
      );
    }
    return h(
      "div",
      { className: "flex flex-col" },
      header,
      h(
        "ul",
        { style: { listStyle: "none", padding: 0, margin: 0 } },
        items.map((path) => {
          const folder = notePath(path);
          return h(
            "li",
            { key: path },
            h(
              "button",
              {
                onClick: () => handleNavigate(path),
                className: "w-full text-left transition-colors group",
                title: path,
                style: {
                  width: "100%",
                  textAlign: "left",
                  padding: "4px 12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--fg-1)"
                }
              },
              h("span", {
                style: {
                  display: "block",
                  fontSize: 12.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }
              }, noteLabel(path)),
              // Only render the parent-folder line when there IS one.
              // For vault-root notes (folder === '') a single "/" is
              // noise — better to omit the subtitle entirely.
              folder ? h("span", {
                style: {
                  display: "block",
                  fontSize: 10.5,
                  color: "var(--fg-4)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }
              }, folder) : null
            )
          );
        })
      ),
      h(
        "div",
        { style: { padding: "4px 12px 8px" } },
        h("button", {
          onClick: handleClear,
          style: {
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 11,
            color: "var(--fg-4)"
          }
        }, "Clear history")
      )
    );
  }
  api.ui.registerSidebarPanel(RecentFilesPanel, {
    id: "recent-files",
    title: "Recent Files",
    icon: "clock",
    order: 10
  });
}
function deactivate() {
}
export {
  activate,
  deactivate
};
