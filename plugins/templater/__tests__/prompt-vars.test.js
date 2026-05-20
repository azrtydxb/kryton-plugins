import { describe, it, expect } from 'vitest';
const { extractPrompts } = require('../template-engine.js');

describe('extractPrompts', () => {
  it('returns unique prompt names in order of first appearance', () => {
    expect(extractPrompts('{{prompt:A}} {{prompt:B}} {{prompt:A}}')).toEqual(['A', 'B']);
  });
  it('empty for no prompts', () => {
    expect(extractPrompts('plain {{date}}')).toEqual([]);
  });
});
