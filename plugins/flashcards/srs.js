// CJS for compatibility with vitest default.
// SM-2 algorithm: ratings 0..3 → Again/Hard/Good/Easy (mapped to quality 1,3,4,5).
function nextReview(card, rating) {
  const quality = [1, 3, 4, 5][rating];
  let { repetitions = 0, easeFactor = 2.5, intervalDays = 0 } = card || {};
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    easeFactor = Math.max(
      1.3,
      easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    );
  }
  const dueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();
  return {
    repetitions,
    easeFactor: Number(easeFactor.toFixed(2)),
    intervalDays,
    dueAt,
  };
}

function hashCard(question, answer) {
  // simple FNV-1a — stable across processes; not crypto
  let h = 0x811c9dc5;
  const s = question + '||' + answer;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

module.exports = { nextReview, hashCard };
