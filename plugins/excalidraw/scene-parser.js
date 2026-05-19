// Pure scene parser/serializer for Excalidraw fences.
// This file is loaded by vitest tests (CJS).
//
// IMPORTANT: The build script (scripts/build-plugins.js) runs esbuild with
// bundle: false, so cross-file requires from client TypeScript do NOT
// resolve at runtime in the browser. The client must INLINE these helpers
// (see client/index.ts). Keep the two implementations in sync.

function parseScene(source) {
  if (source === undefined || source === null) {
    return { elements: [], appState: {} };
  }
  if (typeof source !== 'string' || !source.trim()) {
    return { elements: [], appState: {} };
  }
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (!Array.isArray(parsed.elements)) parsed.elements = [];
      if (!parsed.appState || typeof parsed.appState !== 'object') parsed.appState = {};
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function serializeScene(scene) {
  const safe = scene && typeof scene === 'object' ? scene : {};
  const out = {
    type: 'excalidraw',
    version: 2,
    source: 'kryton',
    elements: Array.isArray(safe.elements) ? safe.elements : [],
    appState: safe.appState && typeof safe.appState === 'object' ? safe.appState : {},
  };
  // Preserve any extra fields (files, etc.) without clobbering our header.
  for (const key of Object.keys(safe)) {
    if (!(key in out)) out[key] = safe[key];
  }
  return JSON.stringify(out, null, 2);
}

function buildFenceBlock(scene, svg) {
  const svgStr = typeof svg === 'string' ? svg.trim() : '';
  return (
    '```excalidraw\n' +
    serializeScene(scene) +
    '\n```\n```excalidraw-preview\n' +
    svgStr +
    '\n```'
  );
}

// Replace the existing excalidraw fence (and any adjacent
// excalidraw-preview fence) in raw note content with `newBlock`.
// Strategy:
//   1. Find the original fence by exact-string match against `originalSource`
//      when supplied; otherwise locate the first ```excalidraw fence near
//      `nearLine` (0-based).
//   2. Detect a trailing ```excalidraw-preview fence and include it in the
//      replacement range so we don't end up with stale previews.
function replaceExcalidrawFences(raw, originalSource, nearLine, newBlock) {
  if (typeof raw !== 'string') throw new Error('raw content must be string');
  const lines = raw.split('\n');

  // Helper: find start of a fenced ```excalidraw[-preview] block, returning
  // { startLine, endLine, language } or null.
  function findFenceAt(startIdx) {
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

  let target = null;

  // Strategy 1: locate via originalSource exact match.
  if (typeof originalSource === 'string' && originalSource.length > 0) {
    const idx = raw.indexOf(originalSource);
    if (idx !== -1) {
      const before = raw.slice(0, idx);
      const startLine = before.split('\n').length - 1;
      const found = findFenceAt(startLine);
      if (found && found.language === 'excalidraw') target = found;
    }
  }

  // Strategy 2: scan for the closest ```excalidraw fence to nearLine.
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
    // Append at end if we genuinely can't find it.
    const sep = raw.endsWith('\n') || raw.length === 0 ? '' : '\n';
    return raw + sep + newBlock + '\n';
  }

  // Look for adjacent ```excalidraw-preview block immediately after target.
  let endLine = target.endLine;
  let scan = target.endLine + 1;
  // Skip blank lines between source and preview.
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

module.exports = { parseScene, serializeScene, buildFenceBlock, replaceExcalidrawFences };
