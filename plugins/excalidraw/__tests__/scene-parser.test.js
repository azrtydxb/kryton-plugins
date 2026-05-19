import { describe, it, expect } from 'vitest';
const {
  parseScene,
  serializeScene,
  buildFenceBlock,
  replaceExcalidrawFences,
} = require('../scene-parser.js');

describe('parseScene', () => {
  it('returns empty scene for blank input', () => {
    expect(parseScene('')).toEqual({ elements: [], appState: {} });
    expect(parseScene('   \n\t')).toEqual({ elements: [], appState: {} });
    expect(parseScene(undefined)).toEqual({ elements: [], appState: {} });
    expect(parseScene(null)).toEqual({ elements: [], appState: {} });
  });

  it('returns null for malformed JSON', () => {
    expect(parseScene('{not json')).toBe(null);
    expect(parseScene('[1, 2,')).toBe(null);
  });

  it('returns null for non-object JSON (arrays, primitives)', () => {
    expect(parseScene('[]')).toBe(null);
    expect(parseScene('42')).toBe(null);
    expect(parseScene('"hi"')).toBe(null);
  });

  it('normalizes missing elements/appState', () => {
    const r = parseScene('{"type":"excalidraw"}');
    expect(r.elements).toEqual([]);
    expect(r.appState).toEqual({});
  });

  it('preserves valid scene data', () => {
    const r = parseScene(
      '{"elements":[{"id":"a","type":"rectangle"}],"appState":{"viewBackgroundColor":"#fff"}}',
    );
    expect(r.elements).toEqual([{ id: 'a', type: 'rectangle' }]);
    expect(r.appState.viewBackgroundColor).toBe('#fff');
  });
});

describe('serializeScene', () => {
  it('emits kryton header fields', () => {
    const out = serializeScene({ elements: [], appState: {} });
    const parsed = JSON.parse(out);
    expect(parsed.type).toBe('excalidraw');
    expect(parsed.version).toBe(2);
    expect(parsed.source).toBe('kryton');
  });

  it('coerces missing elements to empty array', () => {
    const out = serializeScene({});
    const parsed = JSON.parse(out);
    expect(parsed.elements).toEqual([]);
    expect(parsed.appState).toEqual({});
  });

  it('preserves extra fields like files', () => {
    const out = serializeScene({ elements: [], appState: {}, files: { foo: 'bar' } });
    const parsed = JSON.parse(out);
    expect(parsed.files).toEqual({ foo: 'bar' });
  });
});

describe('round-trip parse + serialize', () => {
  it('preserves elements through one cycle', () => {
    const scene = {
      elements: [{ id: '1', type: 'rectangle', x: 10, y: 20 }],
      appState: { viewBackgroundColor: '#fff' },
    };
    const round = parseScene(serializeScene(scene));
    expect(round.elements).toEqual(scene.elements);
    expect(round.appState.viewBackgroundColor).toBe('#fff');
  });
});

describe('buildFenceBlock', () => {
  it('includes both source and preview fences', () => {
    const block = buildFenceBlock({ elements: [] }, '<svg></svg>');
    expect(block).toContain('```excalidraw\n');
    expect(block).toContain('```excalidraw-preview\n<svg></svg>');
  });

  it('trims whitespace from svg', () => {
    const block = buildFenceBlock({ elements: [] }, '   <svg/>\n\n');
    expect(block).toContain('```excalidraw-preview\n<svg/>\n```');
  });

  it('handles missing svg gracefully', () => {
    const block = buildFenceBlock({ elements: [] }, undefined);
    expect(block).toContain('```excalidraw-preview\n\n```');
  });
});

describe('replaceExcalidrawFences', () => {
  const sceneJson = '{"type":"excalidraw","version":2,"source":"kryton","elements":[],"appState":{}}';
  const newBlock = buildFenceBlock({ elements: [{ id: 'new' }] }, '<svg>NEW</svg>');

  it('replaces source fence using originalSource match', () => {
    const original = '```excalidraw\n{"old":true}\n```';
    const raw = `# Heading\n\n${original}\n\nMore text\n`;
    const out = replaceExcalidrawFences(raw, original, 2, newBlock);
    expect(out).not.toContain('{"old":true}');
    expect(out).toContain('```excalidraw\n');
    expect(out).toContain('```excalidraw-preview\n<svg>NEW</svg>');
    expect(out).toContain('# Heading');
    expect(out).toContain('More text');
  });

  it('replaces both source and adjacent preview fences atomically', () => {
    const raw = [
      'intro',
      '```excalidraw',
      '{"old":true}',
      '```',
      '```excalidraw-preview',
      '<svg>OLD</svg>',
      '```',
      'tail',
    ].join('\n');
    const out = replaceExcalidrawFences(raw, null, 1, newBlock);
    expect(out).not.toContain('OLD');
    expect(out).not.toContain('"old":true');
    expect(out).toContain('<svg>NEW</svg>');
    expect(out).toContain('intro');
    expect(out).toContain('tail');
    // Only one excalidraw-preview block remains.
    expect(out.match(/```excalidraw-preview/g).length).toBe(1);
    expect(out.match(/```excalidraw\n/g).length).toBe(1);
  });

  it('falls back to nearLine when originalSource not matched', () => {
    const raw = [
      '```excalidraw',
      '{}',
      '```',
      '',
      '```excalidraw',
      '{"target":true}',
      '```',
    ].join('\n');
    const out = replaceExcalidrawFences(raw, 'NOT_FOUND', 4, newBlock);
    // The second fence (near line 4) should be replaced; first untouched.
    expect(out).toContain(`\`\`\`excalidraw\n{}\n\`\`\``);
    expect(out).not.toContain('"target":true');
  });

  it('appends block when no fence found anywhere', () => {
    const raw = '# just a heading\n';
    const out = replaceExcalidrawFences(raw, null, 0, newBlock);
    expect(out).toContain('# just a heading');
    expect(out).toContain('<svg>NEW</svg>');
  });

  it('preserves preview separated by blank line', () => {
    const raw = [
      '```excalidraw',
      sceneJson,
      '```',
      '',
      '',
      '```excalidraw-preview',
      '<svg>OLD</svg>',
      '```',
    ].join('\n');
    const out = replaceExcalidrawFences(raw, null, 0, newBlock);
    expect(out).not.toContain('OLD');
    expect(out.match(/```excalidraw-preview/g).length).toBe(1);
  });
});
