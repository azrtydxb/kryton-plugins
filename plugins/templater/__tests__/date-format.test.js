import { describe, it, expect } from 'vitest';
const { applyDateFormat, processTemplate } = require('../template-engine.js');

describe('applyDateFormat', () => {
  it('formats YYYY-MM-DD', () => {
    expect(applyDateFormat(new Date(2026, 4, 19), 'YYYY-MM-DD')).toBe('2026-05-19');
  });
  it('formats HH:mm:ss', () => {
    expect(applyDateFormat(new Date(2026, 4, 19, 14, 5, 9), 'HH:mm:ss')).toBe('14:05:09');
  });
});

describe('processTemplate', () => {
  it('substitutes date and prompt vars', () => {
    const out = processTemplate('Title: {{prompt:Title}}\nDate: {{date}}', {
      now: new Date(2026, 4, 19),
      prompts: { Title: 'Hello' },
    });
    expect(out).toContain('Title: Hello');
    expect(out).toContain('Date: 2026-05-19');
  });
  it('leaves unknown vars intact', () => {
    expect(processTemplate('{{unknown}}', {})).toBe('{{unknown}}');
  });
  it('replaces known user vars', () => {
    expect(processTemplate('{{title}}', { vars: { title: 'X' } })).toBe('X');
  });
  it('replaces {{date:FORMAT}} with custom format', () => {
    expect(
      processTemplate('{{date:YYYY/MM/DD}}', { now: new Date(2026, 4, 19) }),
    ).toBe('2026/05/19');
  });
});
