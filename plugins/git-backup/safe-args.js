module.exports.buildCommitArgs = function buildCommitArgs({ message, allFiles = true }) {
  if (typeof message !== 'string' || message.length === 0) throw new Error('commit message required');
  if (message.length > 10_000) throw new Error('commit message too long');
  const args = ['commit'];
  if (allFiles) args.push('-a');
  args.push('-m', message);
  return args;
};

module.exports.validateCwd = function validateCwd(cwd, dataDir) {
  if (typeof cwd !== 'string' || cwd.includes('..')) throw new Error('invalid cwd');
  if (!cwd.startsWith(dataDir)) throw new Error('cwd outside dataDir');
  return cwd;
};
