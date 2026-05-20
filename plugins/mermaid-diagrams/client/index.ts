import type { ClientPluginAPI } from "../../../types/client";

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useRef, useCallback } = React;

// Mermaid is loaded dynamically from CDN to avoid bundling ~2MB
let mermaidInstance: any = null;
let mermaidLoading = false;
let mermaidLoadCallbacks: Array<(mermaid: any) => void> = [];

function currentTheme(): "dark" | "default" {
  // Host writes data-theme="dark" | "light" on <html>; default to light.
  return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
}

async function loadMermaid(): Promise<any> {
  if (mermaidInstance) return mermaidInstance;

  if (mermaidLoading) {
    return new Promise((resolve) => {
      mermaidLoadCallbacks.push(resolve);
    });
  }

  mermaidLoading = true;

  try {
    // @ts-ignore — CDN import resolved at runtime, not by TypeScript
    const mod = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
    mermaidInstance = mod.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: currentTheme(),
    });
    mermaidLoadCallbacks.forEach((cb) => cb(mermaidInstance));
    mermaidLoadCallbacks = [];
    return mermaidInstance;
  } catch (err) {
    mermaidLoading = false;
    throw err;
  }
}

let renderCounter = 0;

function MermaidRenderer({ content, notePath: _notePath }: { content: string; notePath: string }): any {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const [themeKey, setThemeKey] = useState<string>(currentTheme());

  const render = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const mermaid = await loadMermaid();
      // Re-init each render so theme reflects current host theme.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: currentTheme(),
      });
      renderCounter++;
      const id = `mermaid-${renderCounter}-${Date.now()}`;
      const { svg: renderedSvg } = await mermaid.render(id, content);
      setSvg(renderedSvg);
    } catch (err: any) {
      setError(err?.message || "Failed to render diagram");
      setSvg(null);
    } finally {
      setLoading(false);
    }
  }, [content, themeKey]);

  useEffect(() => {
    render();
  }, [render]);

  // Watch for theme changes on <html data-theme="...">
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const next = currentTheme();
      setThemeKey((prev) => (prev === next ? prev : next));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  if (loading) {
    return h(
      "div",
      {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 32, border: "1px solid var(--line)", borderRadius: 8,
          background: "var(--bg-1)", color: "var(--fg-3)", fontSize: 13,
          gap: 8,
        },
      },
      h("div", {
        style: {
          width: 16, height: 16,
          border: "2px solid var(--accent)", borderTopColor: "transparent",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        },
      }),
      "Rendering diagram..."
    );
  }

  if (error) {
    return h(
      "div",
      {
        style: {
          padding: 16, border: "1px solid var(--accent-danger)", borderRadius: 8,
          background: "color-mix(in oklch, var(--accent-danger) 12%, transparent)",
        },
      },
      h(
        "div",
        { style: { fontSize: 13, fontWeight: 500, color: "var(--accent-danger)", marginBottom: 8 } },
        "Mermaid diagram error"
      ),
      h(
        "pre",
        {
          style: {
            fontSize: 11, color: "var(--accent-danger)",
            whiteSpace: "pre-wrap", fontFamily: "var(--font-mono, monospace)",
            margin: 0,
          },
        },
        error
      ),
      h(
        "details",
        { style: { marginTop: 8 } },
        h(
          "summary",
          { style: { fontSize: 11, color: "var(--fg-3)", cursor: "pointer" } },
          "Show source"
        ),
        h(
          "pre",
          {
            style: {
              marginTop: 4, fontSize: 11, color: "var(--fg-2)",
              whiteSpace: "pre-wrap", fontFamily: "var(--font-mono, monospace)",
              background: "var(--bg-2)", padding: 8, borderRadius: 4,
            },
          },
          content
        )
      )
    );
  }

  return h("div", {
    ref: containerRef,
    className: "mermaid-diagram",
    style: {
      display: "flex", justifyContent: "center", padding: 16,
      background: "var(--bg-1)", borderRadius: 8,
      border: "1px solid var(--line)", overflowX: "auto",
    },
    dangerouslySetInnerHTML: { __html: svg },
  });
}

export function activate(api: ClientPluginAPI): void {
  // Register the mermaid code fence renderer
  api.markdown.registerCodeFenceRenderer("mermaid", MermaidRenderer);
}

export function deactivate(): void {
  // Cleanup is handled by the plugin system (removeAllForPlugin)
}
