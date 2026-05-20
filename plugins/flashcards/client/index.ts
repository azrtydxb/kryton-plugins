import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect, useCallback } = React;

interface Flashcard {
  question: string;
  answer: string;
}

interface ReviewState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: string;
}

// SM-2: mirror of plugins/flashcards/srs.js (source of truth, covered by
// __tests__/srs.test.js). esbuild builds this client standalone so we inline.
function srsNextReview(card: Partial<ReviewState>, rating: number): ReviewState {
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

function srsHashCard(question: string, answer: string): string {
  let h = 0x811c9dc5;
  const s = question + '||' + answer;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

const STORAGE_KEY = 'reviews';
const RATING_LABELS = ['Again', 'Hard', 'Good', 'Easy'];
const RATING_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];

function dueTime(state: ReviewState | undefined): number {
  if (!state || !state.dueAt) return 0; // unreviewed cards are due immediately
  const t = Date.parse(state.dueAt);
  return Number.isFinite(t) ? t : 0;
}

function createFlashcardModal(api: ClientPluginAPI): (notePath: string) => void {
  return function openFlashcards(notePath: string): void {
    // Create a modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,0.75)', 'display:flex',
      'align-items:center', 'justify-content:center',
      'padding:20px',
    ].join(';');

    const container = document.createElement('div');
    container.style.cssText = [
      'background:#1e1e2e', 'border:1px solid #4f4f6a',
      'border-radius:12px', 'width:100%', 'max-width:540px',
      'min-height:320px', 'display:flex', 'flex-direction:column',
      'overflow:hidden',
    ].join(';');

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });

    function cleanup(): void {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }

    // Mount a React component into the container
    const { ReactDOM } = window.__krytonPluginDeps as any;

    function FlashcardsApp(): any {
      const [cards, setCards] = useState<Flashcard[]>([]);
      const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [index, setIndex] = useState(0);
      const [revealed, setRevealed] = useState(false);
      const [saving, setSaving] = useState(false);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const [resp, stored] = await Promise.all([
              api.api.fetch(`/cards?path=${encodeURIComponent(notePath)}`),
              api.storage.get(STORAGE_KEY).catch(() => null),
            ]);
            if (cancelled) return;
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as { cards: Flashcard[] };
            const loadedReviews = (stored && typeof stored === 'object'
              ? stored as Record<string, ReviewState>
              : {});
            const loadedCards = (data.cards ?? []).slice();
            // Sort due cards first (oldest dueAt → first; unreviewed = due now).
            loadedCards.sort((a, b) => {
              const da = dueTime(loadedReviews[srsHashCard(a.question, a.answer)]);
              const db = dueTime(loadedReviews[srsHashCard(b.question, b.answer)]);
              return da - db;
            });
            setReviews(loadedReviews);
            setCards(loadedCards);
          } catch (err: any) {
            if (!cancelled) setError(err?.message ?? 'Failed to load cards');
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();
        return () => { cancelled = true; };
      }, []);

      const rateCard = useCallback(async (rating: number) => {
        const card = cards[index];
        if (!card) return;
        const h = srsHashCard(card.question, card.answer);
        const newState = srsNextReview(reviews[h] || {}, rating);
        const updated = { ...reviews, [h]: newState };
        setReviews(updated);
        setSaving(true);
        try {
          await api.storage.set(STORAGE_KEY, updated);
        } catch (err: any) {
          api.notify.error(`Failed to save review: ${err?.message ?? err}`);
        } finally {
          setSaving(false);
        }
        // Advance to next card.
        setRevealed(false);
        setIndex((i: number) => Math.min(i + 1, cards.length - 1));
      }, [cards, index, reviews]);

      const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') { cleanup(); return; }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          setIndex((i: number) => Math.min(i + 1, cards.length - 1));
          setRevealed(false);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          setIndex((i: number) => Math.max(i - 1, 0));
          setRevealed(false);
        }
        if (e.key === ' ') {
          e.preventDefault();
          setRevealed((r: boolean) => !r);
        }
      }, [cards.length]);

      useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
      }, [handleKeyDown]);

      const s = {
        header: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid #4f4f6a',
          background: '#16162a',
        } as any,
        title: { color: '#a78bfa', fontWeight: '600', fontSize: '14px' },
        closeBtn: {
          background: 'none', border: 'none', color: '#9ca3af',
          cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 4px',
        } as any,
        body: {
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', gap: '16px', minHeight: '220px',
        } as any,
        card: {
          width: '100%', borderRadius: '8px',
          background: '#252535', border: '1px solid #3a3a5a',
          padding: '20px', textAlign: 'center',
        } as any,
        question: { fontSize: '16px', color: '#e0e0e0', fontWeight: '500', lineHeight: 1.5 },
        answer: {
          marginTop: '16px', paddingTop: '16px',
          borderTop: '1px solid #4f4f6a', fontSize: '14px',
          color: '#a3e635', lineHeight: 1.6,
        },
        revealBtn: {
          padding: '8px 20px', background: '#7c3aed', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
        } as any,
        nav: {
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 16px', borderTop: '1px solid #4f4f6a',
          justifyContent: 'center',
        } as any,
        navBtn: (disabled: boolean) => ({
          padding: '6px 14px', background: disabled ? '#2a2a3e' : '#3a3a5e',
          color: disabled ? '#4b5563' : '#e0e0e0',
          border: '1px solid #4f4f6a', borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '13px',
        } as any),
        counter: { fontSize: '12px', color: '#6b7280', minWidth: '80px', textAlign: 'center' as const },
        ratingRow: {
          display: 'flex', gap: '8px', marginTop: '12px',
          justifyContent: 'center', flexWrap: 'wrap',
        } as any,
        ratingBtn: (color: string, disabled: boolean) => ({
          padding: '8px 14px',
          background: disabled ? '#2a2a3e' : color,
          color: disabled ? '#4b5563' : '#fff',
          border: 'none', borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px', fontWeight: '600',
          minWidth: '72px',
        } as any),
      };

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
        // Header
        h('div', { style: s.header },
          h('span', { style: s.title }, 'Flashcards'),
          h('button', { onClick: cleanup, style: s.closeBtn }, '\u00D7')
        ),

        // Body
        loading
          ? h('div', { style: { ...s.body, color: '#9ca3af', fontSize: '13px' } }, 'Loading cards...')
          : error
          ? h('div', { style: { ...s.body, color: '#ef4444', fontSize: '13px' } }, error)
          : cards.length === 0
          ? h('div', { style: { ...s.body, color: '#9ca3af', fontSize: '13px', textAlign: 'center' } },
              h('div', null, 'No flashcards found in this note.'),
              h('div', { style: { fontSize: '11px', marginTop: '8px', color: '#6b7280' } },
                'Use Q: / A: pairs or **bold question** paragraphs.'
              )
            )
          : h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
              h('div', { style: s.body },
                h('div', { style: s.card },
                  h('div', { style: s.question }, cards[index].question),
                  revealed
                    ? h('div', null,
                        h('div', { style: s.answer }, cards[index].answer),
                        h('div', { style: s.ratingRow },
                          ...RATING_LABELS.map((label, r) =>
                            h('button', {
                              key: label,
                              style: s.ratingBtn(RATING_COLORS[r], saving),
                              disabled: saving,
                              onClick: () => rateCard(r),
                            }, label),
                          ),
                        ),
                      )
                    : h('button', {
                        style: s.revealBtn,
                        onClick: () => setRevealed(true),
                      }, 'Reveal Answer')
                )
              ),
              h('div', { style: s.nav },
                h('button', {
                  style: s.navBtn(index === 0),
                  disabled: index === 0,
                  onClick: () => { setIndex((i: number) => i - 1); setRevealed(false); },
                }, '← Prev'),
                h('span', { style: s.counter }, `${index + 1} of ${cards.length}`),
                h('button', {
                  style: s.navBtn(index === cards.length - 1),
                  disabled: index === cards.length - 1,
                  onClick: () => { setIndex((i: number) => i + 1); setRevealed(false); },
                }, 'Next →')
              )
            )
      );
    }

    if (ReactDOM && ReactDOM.render) {
      ReactDOM.render(h(FlashcardsApp, null), container);
    } else if (ReactDOM && ReactDOM.createRoot) {
      ReactDOM.createRoot(container).render(h(FlashcardsApp, null));
    }
  };
}

export function activate(api: ClientPluginAPI): void {
  const openFlashcards = createFlashcardModal(api);

  api.ui.registerNoteAction({
    id: 'flashcards-study',
    label: 'Study Flashcards',
    icon: 'layers',
    onClick: (notePath: string) => {
      openFlashcards(notePath);
    },
  });
}

export function deactivate(): void {
  // Cleanup is handled by the plugin system
}
