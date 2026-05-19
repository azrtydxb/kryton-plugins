function makeOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:rgba(0,0,0,0.45)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "z-index:10000",
    "font-family:system-ui,-apple-system,sans-serif"
  ].join(";");
  const panel = document.createElement("div");
  panel.style.cssText = [
    "background:#1f2937",
    "color:#f3f4f6",
    "border-radius:8px",
    "min-width:320px",
    "max-width:480px",
    "max-height:70vh",
    "overflow:hidden",
    "display:flex",
    "flex-direction:column",
    "box-shadow:0 10px 40px rgba(0,0,0,0.5)"
  ].join(";");
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const cleanup = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });
  return { panel, cleanup };
}
function pickFromList(items, title = "Select") {
  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve(null);
      return;
    }
    const { panel, cleanup } = makeOverlay();
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(v);
    };
    const header = document.createElement("div");
    header.textContent = title;
    header.style.cssText = "padding:12px 16px;font-weight:600;border-bottom:1px solid #374151";
    panel.appendChild(header);
    const list = document.createElement("ul");
    list.style.cssText = "list-style:none;margin:0;padding:4px 0;overflow-y:auto;flex:1";
    panel.appendChild(list);
    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.style.cssText = [
        "width:100%",
        "text-align:left",
        "background:transparent",
        "border:none",
        "color:inherit",
        "padding:10px 16px",
        "cursor:pointer",
        "font:inherit",
        "display:flex",
        "flex-direction:column",
        "gap:2px"
      ].join(";");
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "#374151";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
      });
      btn.addEventListener("click", () => finish(item.value));
      const label = document.createElement("span");
      label.textContent = item.label;
      label.style.fontSize = "14px";
      btn.appendChild(label);
      if (item.hint) {
        const hint = document.createElement("span");
        hint.textContent = item.hint;
        hint.style.cssText = "font-size:11px;color:#9ca3af";
        btn.appendChild(hint);
      }
      li.appendChild(btn);
      list.appendChild(li);
    });
    const footer = document.createElement("div");
    footer.style.cssText = "padding:8px 16px;border-top:1px solid #374151;text-align:right";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "background:transparent;border:none;color:#9ca3af;cursor:pointer;font:inherit;padding:4px 8px";
    cancel.addEventListener("click", () => finish(null));
    footer.appendChild(cancel);
    panel.appendChild(footer);
  });
}
function collectPromptValues(promptNames) {
  return new Promise((resolve) => {
    if (promptNames.length === 0) {
      resolve({});
      return;
    }
    const { panel, cleanup } = makeOverlay();
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(v);
    };
    const header = document.createElement("div");
    header.textContent = "Template variables";
    header.style.cssText = "padding:12px 16px;font-weight:600;border-bottom:1px solid #374151";
    panel.appendChild(header);
    const body = document.createElement("div");
    body.style.cssText = "padding:12px 16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1";
    panel.appendChild(body);
    const inputs = {};
    promptNames.forEach((name, i) => {
      const wrap = document.createElement("label");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9ca3af";
      wrap.textContent = name;
      const input = document.createElement("input");
      input.type = "text";
      input.style.cssText = [
        "background:#111827",
        "color:#f3f4f6",
        "border:1px solid #374151",
        "border-radius:4px",
        "padding:6px 8px",
        "font:inherit"
      ].join(";");
      wrap.appendChild(input);
      body.appendChild(wrap);
      inputs[name] = input;
      if (i === 0) setTimeout(() => input.focus(), 0);
    });
    const footer = document.createElement("div");
    footer.style.cssText = "padding:8px 16px;border-top:1px solid #374151;display:flex;gap:8px;justify-content:flex-end";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "background:transparent;border:none;color:#9ca3af;cursor:pointer;font:inherit;padding:6px 10px";
    cancel.addEventListener("click", () => finish(null));
    footer.appendChild(cancel);
    const submit = () => {
      const out = {};
      for (const name of promptNames) out[name] = inputs[name]?.value ?? "";
      finish(out);
    };
    const ok = document.createElement("button");
    ok.textContent = "Apply";
    ok.style.cssText = [
      "background:#7c3aed",
      "border:none",
      "color:white",
      "cursor:pointer",
      "font:inherit",
      "padding:6px 12px",
      "border-radius:4px"
    ].join(";");
    ok.addEventListener("click", submit);
    footer.appendChild(ok);
    panel.appendChild(footer);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });
  });
}
const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;
function basename(p) {
  const parts = p.split("/");
  const filename = parts[parts.length - 1] ?? p;
  return filename.replace(/\.md$/i, "");
}
async function applyTemplateToNote(api, template, notePath) {
  const tplResp = await api.api.fetch(`/template?path=${encodeURIComponent(template.path)}`);
  if (!tplResp.ok) {
    api.notify.error(`Failed to read template: ${template.name}`);
    return;
  }
  const { content: templateContent } = await tplResp.json();
  const promptsResp = await api.api.fetch("/extract-prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: templateContent })
  });
  const { prompts: promptNames } = promptsResp.ok ? await promptsResp.json() : { prompts: [] };
  const promptValues = await collectPromptValues(promptNames);
  if (promptValues === null) return;
  const processResp = await api.api.fetch("/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      template: templateContent,
      vars: { title: basename(notePath) },
      prompts: promptValues
    })
  });
  if (!processResp.ok) {
    api.notify.error("Failed to process template");
    return;
  }
  const { content: processed } = await processResp.json();
  await api.notes.update(notePath, processed);
  await api.notes.openByPath(notePath);
  api.notify.success(`Applied template: ${template.name}`);
}
async function openTemplatePicker(api, notePath) {
  const res = await api.api.fetch("/templates");
  if (!res.ok) {
    api.notify.error("Failed to fetch templates");
    return;
  }
  const { templates } = await res.json();
  if (!templates.length) {
    api.notify.info("No templates found. Create .md files in a Templates/ folder.");
    return;
  }
  const choice = await pickFromList(
    templates.map((t) => ({ label: t.name, value: t, hint: t.path })),
    "Apply template"
  );
  if (!choice) return;
  await applyTemplateToNote(api, choice, notePath);
}
function activate(api) {
  api.commands.register({
    id: "templater:create-from-template",
    name: "Create from Template",
    execute: async () => {
      try {
        const resp = await api.api.fetch("/templates");
        if (!resp.ok) {
          api.notify.error("Failed to fetch templates");
          return;
        }
        const data = await resp.json();
        if (data.templates.length === 0) {
          api.notify.info("No templates found. Create .md files in a Templates/ folder.");
          return;
        }
        const names = data.templates.map((t) => t.name).join(", ");
        api.notify.info(
          `Available templates: ${names}. Use "Apply Template" note action to insert.`
        );
      } catch {
        api.notify.error("Failed to fetch templates");
      }
    }
  });
  api.ui.registerNoteAction({
    id: "templater:apply-template",
    label: "Apply Template",
    icon: "file-text",
    onClick: async (notePath) => {
      try {
        await openTemplatePicker(api, notePath);
      } catch (err) {
        api.notify.error(
          `Failed to apply template: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  });
  function TemplaterPanel() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const currentNote = api.context.useCurrentNote();
    const fetchTemplates = useCallback(async () => {
      setLoading(true);
      try {
        const resp = await api.api.fetch("/templates");
        if (resp.ok) {
          const data = await resp.json();
          setTemplates(data.templates);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }, []);
    useEffect(() => {
      fetchTemplates();
    }, [fetchTemplates]);
    async function applyTemplate(template) {
      if (!currentNote) {
        api.notify.info("Open a note first to apply a template.");
        return;
      }
      try {
        await applyTemplateToNote(api, template, currentNote.path);
      } catch (err) {
        api.notify.error(
          `Failed to apply template: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    if (loading) {
      return h(
        "div",
        { className: "flex items-center justify-center h-full p-4" },
        h(
          "div",
          { className: "flex items-center gap-2 text-sm text-gray-400" },
          h("div", {
            className: "w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"
          }),
          "Loading templates..."
        )
      );
    }
    if (templates.length === 0) {
      return h(
        "div",
        { className: "flex flex-col h-full" },
        h(
          "div",
          { className: "flex-1 flex flex-col items-center justify-center p-4 text-center" },
          h(
            "p",
            { className: "text-sm text-gray-400 dark:text-gray-500" },
            "No templates found."
          ),
          h(
            "p",
            { className: "text-xs text-gray-400 dark:text-gray-500 mt-1" },
            "Create .md files in a Templates/ folder."
          )
        )
      );
    }
    return h(
      "div",
      { className: "flex flex-col h-full" },
      h(
        "ul",
        { className: "flex-1 overflow-y-auto py-1" },
        templates.map(
          (template) => h(
            "li",
            { key: template.path },
            h(
              "button",
              {
                onClick: () => applyTemplate(template),
                className: "w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group",
                title: `Apply template: ${template.name}`
              },
              h(
                "span",
                { className: "block text-sm text-gray-800 dark:text-gray-200 truncate" },
                template.name
              ),
              h(
                "span",
                { className: "block text-xs text-gray-400 dark:text-gray-500 truncate" },
                template.path
              )
            )
          )
        )
      ),
      h(
        "div",
        { className: "px-3 py-2 border-t border-gray-200 dark:border-gray-700" },
        h(
          "button",
          {
            onClick: fetchTemplates,
            className: "text-xs text-gray-400 dark:text-gray-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
          },
          "Refresh"
        )
      )
    );
  }
  api.ui.registerSidebarPanel(TemplaterPanel, {
    id: "templater",
    title: "Templates",
    icon: "file-text",
    order: 30
  });
}
function deactivate() {
}
export {
  activate,
  deactivate
};
