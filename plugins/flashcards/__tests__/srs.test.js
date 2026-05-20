import { describe, it, expect } from 'vitest';
const { nextReview, hashCard } = require('../srs.js');

describe('nextReview SM-2', () => {
  it('first Good review → interval 1', () => {
    const r = nextReview({ repetitions: 0, easeFactor: 2.5, intervalDays: 0 }, 2);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
  });
  it('second Good review → interval 6', () => {
    const r = nextReview({ repetitions: 1, easeFactor: 2.5, intervalDays: 1 }, 2);
    expect(r.intervalDays).toBe(6);
  });
  it('Again resets repetitions', () => {
    const r = nextReview({ repetitions: 5, easeFactor: 2.5, intervalDays: 30 }, 0);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(1);
  });
  it('ease factor floor at 1.3', () => {
    let card = { repetitions: 0, easeFactor: 1.3, intervalDays: 0 };
    for (let i = 0; i < 10; i++) card = nextReview(card, 1);
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
  it('returns ISO dueAt', () => {
    const r = nextReview({}, 2);
    expect(typeof r.dueAt).toBe('string');
    expect(() => new Date(r.dueAt).toISOString()).not.toThrow();
  });
});

describe('hashCard', () => {
  it('is stable', () => {
    expect(hashCard('q', 'a')).toBe(hashCard('q', 'a'));
  });
  it('differs across content', () => {
    expect(hashCard('q1', 'a')).not.toBe(hashCard('q2', 'a'));
  });
  it('is 8 hex chars', () => {
    expect(hashCard('hello', 'world')).toMatch(/^[0-9a-f]{8}$/);
  });
});
