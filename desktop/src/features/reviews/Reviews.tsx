import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Empty, PageHeading, Panel } from '../../components/ui';
import { reviewCard, Rating } from '../../learning/reviews';
import type { Grade } from 'ts-fsrs';
import type { Commit } from '../../hooks/useWorkspace';
import type { Workspace } from '../../types/state';
import { dayKey } from '../../learning/planner';

export function Reviews({
  state,
  commit,
  run,
}: {
  state: Workspace;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [working, setWorking] = useState(false);
  const now = new Date();
  const due = state.cards
    .filter((c) => new Date(c.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
  const card = due[0];
  const overdue = due.filter((c) => dayKey(c.due) < dayKey(now)).length;
  return (
    <>
      <PageHeading
        eyebrow="SPACED RETRIEVAL / FSRS"
        title="Remember a little longer."
        description="Try to retrieve the connection before you reveal the answer."
      />
      <div className="review-counts">
        <span>
          Today <strong>{due.length}</strong>
        </span>
        <span>
          Overdue <strong>{overdue}</strong>
        </span>
        <span>
          Upcoming <strong>{state.cards.length - due.length}</strong>
        </span>
      </div>
      {card ? (
        <Panel className="review-card">
          <div className="eyebrow">
            {state.courses.find((c) => c.id === card.courseId)?.name} ·{' '}
            {card.reps ? 'RETRIEVAL' : 'NEW CONNECTION'}
          </div>
          <h2>{card.front}</h2>
          {revealed ? (
            <>
              <div className="review-answer prose">{card.back}</div>
              <p className="muted">How well did you recall it?</p>
              <div className="rating-buttons">
                {[
                  { label: 'Again', value: Rating.Again },
                  { label: 'Hard', value: Rating.Hard },
                  { label: 'Good', value: Rating.Good },
                  { label: 'Easy', value: Rating.Easy },
                ].map((r) => (
                  <button
                    key={r.label}
                    disabled={working}
                    className={r.label.toLowerCase()}
                    onClick={() =>
                      run(async () => {
                        setWorking(true);
                        try {
                          await commit((s) => {
                            const current = s.cards.find((c) => c.id === card.id);
                            if (!current) throw new Error('This card was removed.');
                            const time = new Date();
                            return {
                              ...s,
                              cards: s.cards.map((c) =>
                                c.id === current.id
                                  ? reviewCard(current, r.value as Grade, time)
                                  : c,
                              ),
                              reviews: [
                                ...s.reviews,
                                {
                                  id: crypto.randomUUID(),
                                  courseId: current.courseId,
                                  cardId: current.id,
                                  topicId: current.topicId,
                                  rating: r.value,
                                  createdAt: time.toISOString(),
                                },
                              ],
                            };
                          });
                          setRevealed(false);
                        } finally {
                          setWorking(false);
                        }
                      })
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="muted">Say or write the answer from memory.</p>
              <button className="primary" onClick={() => setRevealed(true)}>
                Reveal answer
              </button>
            </>
          )}
        </Panel>
      ) : (
        <Panel>
          <Empty
            title="A clear mind. A clear queue."
            description="No cards are due right now. Future reviews will appear when FSRS schedules them."
          >
            <CheckCircle2 className="success" size={35} />
          </Empty>
        </Panel>
      )}
    </>
  );
}
