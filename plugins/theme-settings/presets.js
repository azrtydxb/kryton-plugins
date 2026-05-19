// CJS for compatibility with vitest default.

const PRESETS = {
  default: {
    name: 'Default',
    accent: '#8b5cf6',
    fontFamily: 'system-ui',
    fontSize: 16,
    lineHeight: 1.6,
    contentMaxWidth: 800,
    mode: 'system',
  },
  'solarized-light': {
    name: 'Solarized Light',
    accent: '#268bd2',
    fontFamily: 'Menlo, monospace',
    fontSize: 15,
    lineHeight: 1.7,
    contentMaxWidth: 720,
    mode: 'light',
  },
  'solarized-dark': {
    name: 'Solarized Dark',
    accent: '#b58900',
    fontFamily: 'Menlo, monospace',
    fontSize: 15,
    lineHeight: 1.7,
    contentMaxWidth: 720,
    mode: 'dark',
  },
  nord: {
    name: 'Nord',
    accent: '#88c0d0',
    fontFamily: 'Inter, sans-serif',
    fontSize: 16,
    lineHeight: 1.6,
    contentMaxWidth: 800,
    mode: 'dark',
  },
  dracula: {
    name: 'Dracula',
    accent: '#bd93f9',
    fontFamily: 'Fira Code, monospace',
    fontSize: 15,
    lineHeight: 1.6,
    contentMaxWidth: 800,
    mode: 'dark',
  },
};

function buildStyles(opts) {
  const {
    accent,
    fontFamily,
    fontSize,
    lineHeight,
    contentMaxWidth,
  } = opts;
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
  if (mode === 'system') {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  }
  return mode;
}

module.exports = { PRESETS, buildStyles, resolveMode };
