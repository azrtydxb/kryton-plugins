import { describe, it, expect } from 'vitest';
const { buildCommitArgs, validateCwd } = require('../safe-args.js');

describe('buildCommitArgs', () => {
  it('quotes adversarial commit messages safely as a single argv entry', () => {
    const args = buildCommitArgs({ message: "'; rm -rf /; #" });
    expect(args).toEqual(['commit', '-a', '-m', "'; rm -rf /; #"]);
  });
  it('rejects empty messages', () => {
    expect(() => buildCommitArgs({ message: '' })).toThrow();
  });
  it('omits -a when allFiles=false', () => {
    expect(buildCommitArgs({ message: 'x', allFiles: false })).toEqual(['commit', '-m', 'x']);
  });
});

describe('validateCwd', () => {
  it('rejects path traversal', () => {
    expect(() => validateCwd('/data/notes/../etc', '/data')).toThrow();
  });
  it('rejects paths outside dataDir', () => {
    expect(() => validateCwd('/other/notes', '/data')).toThrow();
  });
  it('accepts paths inside dataDir', () => {
    expect(validateCwd('/data/notes', '/data')).toBe('/data/notes');
  });
});
