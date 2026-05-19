import { describe, it, expect } from 'vitest';
const { PRESETS, buildStyles, resolveMode } = require('../presets.js');

describe('presets', () => {
  it('every preset has required fields', () => {
    for (const p of Object.values(PRESETS)) {
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof p.fontSize).toBe('number');
      expect(['light', 'dark', 'system']).toContain(p.mode);
      expect(typeof p.fontFamily).toBe('string');
      expect(typeof p.lineHeight).toBe('number');
      expect(typeof p.contentMaxWidth).toBe('number');
      expect(typeof p.name).toBe('string');
    }
  });
  it('includes the expected presets', () => {
    expect(Object.keys(PRESETS)).toEqual(
      expect.arrayContaining(['default', 'solarized-light', 'solarized-dark', 'nord', 'dracula']),
    );
  });
  it('buildStyles embeds accent', () => {
    expect(buildStyles(PRESETS.dracula)).toContain('#bd93f9');
  });
  it('buildStyles embeds fontFamily and fontSize', () => {
    const css = buildStyles(PRESETS.nord);
    expect(css).toContain('Inter, sans-serif');
    expect(css).toContain('16px');
  });
  it('resolveMode passes through light/dark', () => {
    expect(resolveMode('dark')).toBe('dark');
    expect(resolveMode('light')).toBe('light');
  });
  it('resolveMode handles system without window', () => {
    // In vitest node env, window is undefined → defaults to light
    expect(resolveMode('system')).toBe('light');
  });
});
