import type { ClientPluginAPI, CodeFenceRendererProps, CodeFenceRange } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useRef, useEffect, useCallback, Fragment } = React;

// ---------------------------------------------------------------------------
// Inlined scene helpers (must stay in sync with ../scene-parser.js).
// Cannot `require` it because esbuild builds with bundle:false.
// ---------------------------------------------------------------------------

interface Scene {
  type?: string;
  version?: number;
  source?: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  [k: string]: unknown;
}

function parseScene(source: string | undefined | null): Scene | null {
  if (source === undefined || source === null) return { elements: [], appState: {} };
  if (typeof source !== 'string' || !source.trim()) return { elements: [], appState: {} };
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (!Array.isArray(parsed.elements)) parsed.elements = [];
      if (!parsed.appState || typeof parsed.appState !== 'object') parsed.appState = {};
      return parsed as Scene;
    }
    return null;
  } catch {
    return null;
  }
}

function serializeScene(scene: Partial<Scene>): string {
  const safe: Partial<Scene> = scene && typeof scene === 'object' ? scene : {};
  const out: Scene = {
    type: 'excalidraw',
    version: 2,
    source: 'kryton',
    elements: Array.isArray(safe.elements) ? safe.elements : [],
    appState: safe.appState && typeof safe.appState === 'object' ? safe.appState : {},
  };
  for (const key of Object.keys(safe)) {
    if (!(key in out)) (out as Record<string, unknown>)[key] = (safe as Record<string, unknown>)[key];
  }
  return JSON.stringify(out, null, 2);
}

function buildFenceBlock(scene: Partial<Scene>, svg: string | undefined): string {
  const svgStr = typeof svg === 'string' ? svg.trim() : '';
  return (
    '```excalidraw\n' +
    serializeScene(scene) +
    '\n```\n```excalidraw-preview\n' +
    svgStr +
    '\n```'
  );
}

function replaceExcalidrawFences(
  raw: string,
  originalSource: string | null | undefined,
  nearLine: number | undefined,
  newBlock: string,
): string {
  if (typeof raw !== 'string') throw new Error('raw content must be string');
  const lines = raw.split('\n');

  function findFenceAt(startIdx: number): { startLine: number; endLine: number; language: string } | null {
    const opener = lines[startIdx];
    if (!opener) return null;
    const m = opener.match(/^```(excalidraw(?:-preview)?)\s*$/);
    if (!m) return null;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '```') {
        return { startLine: startIdx, endLine: i, language: m[1] };
      }
    }
    return null;
  }

  let target: { startLine: number; endLine: number; language: string } | null = null;

  if (typeof originalSource === 'string' && originalSource.length > 0) {
    const idx = raw.indexOf(originalSource);
    if (idx !== -1) {
      const before = raw.slice(0, idx);
      const startLine = before.split('\n').length - 1;
      const found = findFenceAt(startLine);
      if (found && found.language === 'excalidraw') target = found;
    }
  }

  if (!target) {
    let bestDist = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (/^```excalidraw\s*$/.test(lines[i])) {
        const found = findFenceAt(i);
        if (!found) continue;
        const dist = typeof nearLine === 'number' ? Math.abs(i - nearLine) : i;
        if (dist < bestDist) {
          bestDist = dist;
          target = found;
        }
      }
    }
  }

  if (!target) {
    const sep = raw.endsWith('\n') || raw.length === 0 ? '' : '\n';
    return raw + sep + newBlock + '\n';
  }

  let endLine = target.endLine;
  let scan = target.endLine + 1;
  while (scan < lines.length && lines[scan].trim() === '') scan++;
  if (scan < lines.length && /^```excalidraw-preview\s*$/.test(lines[scan])) {
    const preview = findFenceAt(scan);
    if (preview) endLine = preview.endLine;
  }

  const before = lines.slice(0, target.startLine).join('\n');
  const after = lines.slice(endLine + 1).join('\n');
  const prefix = before.length > 0 ? before + '\n' : '';
  const suffix = after.length > 0 ? '\n' + after : '';
  return prefix + newBlock + suffix;
}

// ---------------------------------------------------------------------------
// Dynamic Excalidraw loader. Only the editor modal needs the heavy lib;
// previews render without it.
// ---------------------------------------------------------------------------

interface ExcalidrawLib {
  Excalidraw: any;
  exportToSvg: (opts: { elements: unknown[]; appState: Record<string, unknown>; files: unknown }) => Promise<SVGSVGElement | string>;
}

let excalidrawLibPromise: Promise<ExcalidrawLib> | null = null;

const EXCALIDRAW_CDN_URL =
  'https://esm.sh/@excalidraw/excalidraw@0.17.6?bundle&deps=react@18.2.0,react-dom@18.2.0';

function loadExcalidraw(): Promise<ExcalidrawLib> {
  if (!excalidrawLibPromise) {
    // Use an indirect dynamic import so TypeScript does not try to resolve
    // the URL as a module specifier. The URL is loaded by the browser at
    // runtime via native ESM.
    const dynImport = new Function('u', 'return import(u);') as (
      u: string,
    ) => Promise<any>;
    excalidrawLibPromise = dynImport(EXCALIDRAW_CDN_URL).then(
      (mod: any) => mod as ExcalidrawLib,
    );
  }
  return excalidrawLibPromise;
}

// ---------------------------------------------------------------------------
// Preview component — pure JSON inspect, no heavy lib.
// ---------------------------------------------------------------------------

function ExcalidrawPreview({
  source,
  onOpen,
}: {
  source: string;
  onOpen: () => void;
}): any {
  const scene = parseScene(source);

  if (scene === null) {
    return h(
      'div',
      {
        style: {
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '12px',
          background: 'rgba(239,68,68,0.1)',
          color: '#ef4444',
          fontSize: '13px',
        },
      },
      h('strong', null, 'Excalidraw: malformed JSON'),
      h(
        'div',
        { style: { marginTop: '8px', fontSize: '12px', opacity: 0.8 } },
        'Open the editor to start a fresh scene, or fix the JSON manually.',
      ),
      h(
        'button',
        {
          onClick: onOpen,
          style: {
            marginTop: '12px',
            padding: '6px 12px',
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
        },
        'Open editor',
      ),
    );
  }

  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const elementCount = elements.length;

  return h(
    'div',
    {
      style: {
        border: '2px solid #4f4f6a',
        borderRadius: '8px',
        padding: '16px',
        background: '#1e1e2e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', color: '#a78bfa' } },
      h(
        'svg',
        {
          width: '20',
          height: '20',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('path', { d: 'M12 20h9' }),
        h('path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }),
      ),
      h('span', { style: { fontWeight: 600, fontSize: '14px' } }, 'Excalidraw scene'),
    ),
    h(
      'div',
      { style: { color: '#9ca3af', fontSize: '13px' } },
      elementCount === 0 ? 'Empty diagram' : `${elementCount} element${elementCount !== 1 ? 's' : ''}`,
    ),
    h(
      'button',
      {
        onClick: onOpen,
        style: {
          padding: '6px 14px',
          background: '#7c3aed',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '13px',
        },
      },
      'Open editor',
    ),
  );
}

// ---------------------------------------------------------------------------
// Cached preview component — for the ```excalidraw-preview fence.
// The cached SVG is the fence body; render it raw.
// ---------------------------------------------------------------------------

function ExcalidrawCachedPreview({ source }: { source: string }): any {
  const html = typeof source === 'string' ? source : '';
  return h('div', {
    style: { overflow: 'auto', maxWidth: '100%' },
    dangerouslySetInnerHTML: { __html: html },
  });
}

// ---------------------------------------------------------------------------
// Editor modal — lazy-loads Excalidraw.
// ---------------------------------------------------------------------------

function EditorModal({
  source,
  onSave,
  onClose,
}: {
  source: string;
  onSave: (scene: Scene, svg: string) => Promise<void> | void;
  onClose: () => void;
}): any {
  const [lib, setLib] = useState<ExcalidrawLib | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const initialScene = useRef<Scene>(parseScene(source) || { elements: [], appState: {} });
  const sceneRef = useRef<Scene>(initialScene.current);

  useEffect(() => {
    let cancelled = false;
    loadExcalidraw()
      .then((mod) => {
        if (!cancelled) setLib(mod);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[excalidraw] failed to load:', err);
          setLoadError(err?.message || String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!lib || saving) return;
    setSaving(true);
    try {
      const elements = sceneRef.current.elements;
      const appState = sceneRef.current.appState;
      const result = await lib.exportToSvg({ elements, appState, files: null });
      let svgString = '';
      if (typeof result === 'string') {
        svgString = result;
      } else if (result && typeof (result as any).outerHTML === 'string') {
        svgString = (result as SVGSVGElement).outerHTML;
      } else if (result && typeof (globalThis as any).XMLSerializer !== 'undefined') {
        svgString = new (globalThis as any).XMLSerializer().serializeToString(result as Node);
      }
      await onSave({ elements, appState }, svgString);
    } catch (err: any) {
      console.error('[excalidraw] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [lib, saving, onSave]);

  const overlayStyle = {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
  };

  if (loadError) {
    return h(
      'div',
      { style: overlayStyle },
      h(
        'div',
        {
          style: {
            margin: 'auto',
            background: '#1e1e2e',
            color: '#fff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '420px',
          },
        },
        h('h3', { style: { marginTop: 0 } }, 'Failed to load Excalidraw'),
        h('pre', { style: { fontSize: '12px', whiteSpace: 'pre-wrap' } }, loadError),
        h(
          'button',
          { onClick: onClose, style: { marginTop: '12px', padding: '6px 14px' } },
          'Close',
        ),
      ),
    );
  }

  if (!lib) {
    return h(
      'div',
      { style: overlayStyle },
      h(
        'div',
        { style: { margin: 'auto', color: '#fff', fontSize: '14px' } },
        'Loading Excalidraw…',
      ),
    );
  }

  return h(
    'div',
    { style: { ...overlayStyle, background: '#fff' } },
    h(
      'div',
      {
        style: {
          padding: '8px 12px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#fafafa',
        },
      },
      h('span', { style: { fontWeight: 600, marginRight: 'auto' } }, 'Excalidraw'),
      h(
        'button',
        {
          onClick: handleSave,
          disabled: saving,
          style: {
            padding: '6px 14px',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.6 : 1,
          },
        },
        saving ? 'Saving…' : 'Save',
      ),
      h(
        'button',
        {
          onClick: onClose,
          disabled: saving,
          style: { padding: '6px 14px', borderRadius: '4px' },
        },
        'Cancel',
      ),
    ),
    h(
      'div',
      { style: { flex: 1, minHeight: 0 } },
      h(lib.Excalidraw, {
        initialData: initialScene.current,
        onChange: (elements: unknown[], appState: Record<string, unknown>) => {
          sceneRef.current = { elements, appState };
        },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Top-level renderer + activate.
// ---------------------------------------------------------------------------

function ExcalidrawFenceRoot(props: CodeFenceRendererProps): any {
  const { content, notePath, range, source } = props;
  const [open, setOpen] = useState(false);

  const handleSave = useCallback(
    async (scene: Scene, svg: string) => {
      const newBlock = buildFenceBlock(scene, svg);
      const saveFn = (window as any).__excalidrawSave as
        | ((
            path: string,
            range: CodeFenceRange | undefined,
            src: string | undefined,
            block: string,
          ) => Promise<void>)
        | undefined;
      if (saveFn) {
        await saveFn(notePath, range, source, newBlock);
      } else {
        console.warn('[excalidraw] no save handler registered');
      }
      setOpen(false);
    },
    [notePath, range, source],
  );

  return h(
    Fragment,
    null,
    h(ExcalidrawPreview, { source: content, onOpen: () => setOpen(true) }),
    open &&
      h(EditorModal, {
        source: content,
        onSave: handleSave,
        onClose: () => setOpen(false),
      }),
  );
}

function activate(api: ClientPluginAPI): void {
  // Stash a save closure on window so the renderer (which is constructed
  // by the host without direct api access) can reach it.
  (window as any).__excalidrawSave = async (
    notePath: string,
    range: CodeFenceRange | undefined,
    originalSource: string | undefined,
    newBlock: string,
  ): Promise<void> => {
    if (!notePath) {
      console.warn('[excalidraw] cannot save: no notePath');
      return;
    }
    try {
      // Robust round-trip via raw content: do not trust `range` blindly
      // because it is in post-frontmatter / post-wikilink coordinates and
      // may not align with the raw file when frontmatter or embeds are
      // present. Locate the existing excalidraw fence (+ adjacent
      // excalidraw-preview fence) by exact-string match against
      // `originalSource`, falling back to nearest fence to `range.startLine`.
      const raw = await api.notes.getContent(notePath);
      const updated = replaceExcalidrawFences(
        raw,
        originalSource,
        range?.startLine,
        newBlock,
      );
      if (updated === raw) {
        console.warn('[excalidraw] save produced no change');
        return;
      }
      await api.notes.update(notePath, updated);
      api.notify?.success?.('Excalidraw scene saved');
    } catch (err: any) {
      console.error('[excalidraw] save failed:', err);
      api.notify?.error?.(`Excalidraw save failed: ${err?.message || err}`);
    }
  };

  api.markdown.registerCodeFenceRenderer('excalidraw', ExcalidrawFenceRoot);
  api.markdown.registerCodeFenceRenderer(
    'excalidraw-preview',
    ({ content }: CodeFenceRendererProps) => h(ExcalidrawCachedPreview, { source: content }),
  );
}

function deactivate(): void {
  delete (window as any).__excalidrawSave;
  excalidrawLibPromise = null;
}

export { activate, deactivate };
