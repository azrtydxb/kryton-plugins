const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect } = React;
const STYLE_ELEMENT_ID = "kryton-theme-settings-styles";
const PRESETS = {
  default: {
    name: "Default",
    accent: "#8b5cf6",
    fontFamily: "system-ui",
    fontSize: 16,
    lineHeight: 1.6,
    contentMaxWidth: 800,
    mode: "system"
  },
  "solarized-light": {
    name: "Solarized Light",
    accent: "#268bd2",
    fontFamily: "Menlo, monospace",
    fontSize: 15,
    lineHeight: 1.7,
    contentMaxWidth: 720,
    mode: "light"
  },
  "solarized-dark": {
    name: "Solarized Dark",
    accent: "#b58900",
    fontFamily: "Menlo, monospace",
    fontSize: 15,
    lineHeight: 1.7,
    contentMaxWidth: 720,
    mode: "dark"
  },
  nord: {
    name: "Nord",
    accent: "#88c0d0",
    fontFamily: "Inter, sans-serif",
    fontSize: 16,
    lineHeight: 1.6,
    contentMaxWidth: 800,
    mode: "dark"
  },
  dracula: {
    name: "Dracula",
    accent: "#bd93f9",
    fontFamily: "Fira Code, monospace",
    fontSize: 15,
    lineHeight: 1.6,
    contentMaxWidth: 800,
    mode: "dark"
  }
};
function buildStyles(opts) {
  const { accent, fontFamily, fontSize, lineHeight, contentMaxWidth } = opts;
  return `
:root { --accent: ${accent}; --accent-color: ${accent}; --base-font-size: ${fontSize}px; --line-height: ${lineHeight}; --content-max-width: ${contentMaxWidth}px; }
:root[data-theme="dark"] { color-scheme: dark; }
:root[data-theme="light"] { color-scheme: light; }
body { font-size: ${fontSize}px; }
body, [data-editor-root], .markdown-preview { font-family: ${fontFamily}; line-height: ${lineHeight}; }
.markdown-preview { max-width: ${contentMaxWidth}px; }
a, .text-violet-500, .text-purple-500 { color: var(--accent-color); }
button.bg-violet-500, button.bg-purple-500 { background-color: var(--accent-color) !important; }
`.trim();
}
function resolveMode(mode) {
  if (mode === "system") {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return mode;
}
function applyStyles(css) {
  let el = document.getElementById(STYLE_ELEMENT_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
function applyTheme(opts) {
  applyStyles(buildStyles(opts));
  const resolved = resolveMode(opts.mode);
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", resolved);
  }
}
function removeStyles() {
  const el = document.getElementById(STYLE_ELEMENT_ID);
  if (el) el.remove();
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.removeAttribute("data-theme");
  }
}
function lhToString(lh, fallback) {
  if (typeof lh === "number" && Number.isFinite(lh)) return String(lh);
  if (typeof lh === "string" && lh.trim()) return lh;
  return fallback;
}
function normalizeMode(m) {
  return m === "light" || m === "dark" || m === "system" ? m : "system";
}
function activate(api) {
  function ThemeSettingsSection() {
    const presetKey = api.context.usePluginSettings("preset") ?? "default";
    const mode = normalizeMode(api.context.usePluginSettings("mode"));
    const accentColor = api.context.usePluginSettings("accentColor") ?? "#8b5cf6";
    const fontSize = api.context.usePluginSettings("fontSize") ?? 14;
    const editorFont = api.context.usePluginSettings("editorFont") ?? "monospace";
    const lineHeight = lhToString(api.context.usePluginSettings("lineHeight"), "1.6");
    const contentWidth = api.context.usePluginSettings("contentWidth") ?? 768;
    useEffect(() => {
      applyTheme({
        accent: accentColor,
        fontFamily: editorFont,
        fontSize,
        lineHeight,
        contentMaxWidth: contentWidth,
        mode
      });
    }, [accentColor, fontSize, editorFont, lineHeight, contentWidth, mode]);
    const [localPreset, setLocalPreset] = useState(presetKey);
    const [localMode, setLocalMode] = useState(mode);
    const [localAccent, setLocalAccent] = useState(accentColor);
    const [localFontSize, setLocalFontSize] = useState(String(fontSize));
    const [localEditorFont, setLocalEditorFont] = useState(editorFont);
    const [localLineHeight, setLocalLineHeight] = useState(lineHeight);
    const [localContentWidth, setLocalContentWidth] = useState(String(contentWidth));
    function handlePresetChange(key) {
      setLocalPreset(key);
      const p = PRESETS[key];
      if (!p) return;
      setLocalAccent(p.accent);
      setLocalFontSize(String(p.fontSize));
      setLocalEditorFont(p.fontFamily);
      setLocalLineHeight(String(p.lineHeight));
      setLocalContentWidth(String(p.contentMaxWidth));
      setLocalMode(p.mode);
    }
    function handlePreview() {
      applyTheme({
        accent: localAccent,
        fontFamily: localEditorFont,
        fontSize: Number(localFontSize) || 14,
        lineHeight: localLineHeight,
        contentMaxWidth: Number(localContentWidth) || 768,
        mode: localMode
      });
      api.notify.success("Preview applied. Save your settings to persist.");
    }
    const rowClass = "flex flex-col gap-1 mb-4";
    const labelClass = "text-sm font-medium text-gray-700 dark:text-gray-300";
    const inputClass = "w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500";
    return h(
      "div",
      { className: "p-4 max-w-md" },
      h(
        "h3",
        { className: "text-base font-semibold mb-4 text-gray-800 dark:text-gray-200" },
        "Appearance"
      ),
      // Preset dropdown
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Preset"),
        h(
          "select",
          {
            value: localPreset,
            onChange: (e) => handlePresetChange(e.target.value),
            className: inputClass
          },
          ...Object.keys(PRESETS).map(
            (k) => h("option", { key: k, value: k }, PRESETS[k].name)
          )
        )
      ),
      // Mode radio group
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Color mode"),
        h(
          "div",
          { className: "flex items-center gap-4" },
          ...["light", "dark", "system"].map(
            (m) => h(
              "label",
              { key: m, className: "flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300" },
              h("input", {
                type: "radio",
                name: "theme-mode",
                value: m,
                checked: localMode === m,
                onChange: () => setLocalMode(m)
              }),
              m.charAt(0).toUpperCase() + m.slice(1)
            )
          )
        )
      ),
      // Accent color
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Accent color"),
        h(
          "div",
          { className: "flex items-center gap-2" },
          h("input", {
            type: "color",
            value: localAccent,
            onChange: (e) => setLocalAccent(e.target.value),
            className: "h-8 w-12 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
          }),
          h("input", {
            type: "text",
            value: localAccent,
            onChange: (e) => setLocalAccent(e.target.value),
            className: inputClass + " flex-1",
            placeholder: "#8b5cf6"
          })
        )
      ),
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Base font size (px)"),
        h("input", {
          type: "number",
          value: localFontSize,
          onChange: (e) => setLocalFontSize(e.target.value),
          min: 10,
          max: 32,
          className: inputClass
        })
      ),
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Editor font family"),
        h("input", {
          type: "text",
          value: localEditorFont,
          onChange: (e) => setLocalEditorFont(e.target.value),
          className: inputClass,
          placeholder: "monospace"
        })
      ),
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Line height"),
        h("input", {
          type: "text",
          value: localLineHeight,
          onChange: (e) => setLocalLineHeight(e.target.value),
          className: inputClass,
          placeholder: "1.6"
        })
      ),
      h(
        "div",
        { className: rowClass },
        h("label", { className: labelClass }, "Content max width (px)"),
        h("input", {
          type: "number",
          value: localContentWidth,
          onChange: (e) => setLocalContentWidth(e.target.value),
          min: 400,
          max: 1600,
          className: inputClass
        })
      ),
      h("button", {
        onClick: handlePreview,
        className: "mt-2 px-4 py-2 text-sm rounded bg-violet-500 hover:bg-violet-600 text-white font-medium transition-colors"
      }, "Preview")
    );
  }
  api.ui.registerSettingsSection(ThemeSettingsSection, {
    id: "theme-settings",
    title: "Theme Settings"
  });
  function ThemeApplier() {
    const mode = normalizeMode(api.context.usePluginSettings("mode"));
    const accentColor = api.context.usePluginSettings("accentColor") ?? "#8b5cf6";
    const fontSize = api.context.usePluginSettings("fontSize") ?? 14;
    const editorFont = api.context.usePluginSettings("editorFont") ?? "monospace";
    const lineHeight = lhToString(api.context.usePluginSettings("lineHeight"), "1.6");
    const contentWidth = api.context.usePluginSettings("contentWidth") ?? 768;
    useEffect(() => {
      applyTheme({
        accent: accentColor,
        fontFamily: editorFont,
        fontSize,
        lineHeight,
        contentMaxWidth: contentWidth,
        mode
      });
    }, [accentColor, fontSize, editorFont, lineHeight, contentWidth, mode]);
    useEffect(() => {
      if (mode !== "system") return;
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        applyTheme({
          accent: accentColor,
          fontFamily: editorFont,
          fontSize,
          lineHeight,
          contentMaxWidth: contentWidth,
          mode
        });
      };
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
      }
      if (typeof mq.addListener === "function") {
        mq.addListener(onChange);
        return () => mq.removeListener(onChange);
      }
      return void 0;
    }, [mode, accentColor, fontSize, editorFont, lineHeight, contentWidth]);
    return null;
  }
  api.ui.registerStatusBarItem(ThemeApplier, {
    id: "theme-settings-applier",
    position: "right",
    order: 999
  });
}
function deactivate() {
  removeStyles();
}
export {
  activate,
  deactivate
};
