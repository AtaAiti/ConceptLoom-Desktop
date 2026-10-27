import { useEffect, useState } from 'react';
import { Citations } from '../library/SourceContext';
import { CheckCircle2 } from 'lucide-react';
import { Empty, Panel, Progress } from '../../components/ui';
import { reviewCard, Rating } from '../../learning/reviews';
import type { Grade } from 'ts-fsrs';
import type { Commit } from '../../hooks/useWorkspace';
import type { Workspace } from '../../types/state';

function intervalLabel(due: string, now: Date) {
  const minutes = Math.max(1, Math.round((new Date(due).getTime() - now.getTime()) / 60000));
  const unit = minutes >= 1440 ? 'day' : minutes >= 60 ? 'hour' : 'minute';
  const value =
    unit === 'day'
      ? Math.round(minutes / 1440)
      : unit === 'hour'
        ? Math.round(minutes / 60)
        : minutes;
  return new Intl.RelativeTimeFormat('ru', { numeric: 'always' }).format(value, unit);
}
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
  const [completed, setCompleted] = useState(0);
  const now = new Date();
  const due = state.cards
    .filter((c) => new Date(c.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
  const card = due[0];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || working || !card)
        return;
      if (
        (event.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],button',
        )
      )
        return;
      if (event.code === 'Space' && !revealed) {
        event.preventDefault();
        setRevealed(true);
      }
      if (revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        document
          .querySelectorAll<HTMLButtonElement>('.rating-buttons button')
          [Number(event.key) - 1]?.click();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [card?.id, revealed, working]);
  return (
    <>
      <div className="review-progress">
        <span>
          {card ? `Карточка ${completed + 1} из ${completed + due.length}` : 'Повторение завершено'}
        </span>
        <Progress
          value={completed + due.length ? (completed / (completed + due.length)) * 100 : 100}
        />
        <small>Осталось {due.length}</small>
      </div>
      {card ? (
        <>
          <Panel className="review-card">
            <span className="status-pill">{card.reps ? 'ВОСПРОИЗВЕДЕНИЕ' : 'НОВАЯ СВЯЗЬ'}</span>
            <h2>{card.front}</h2>
            {revealed ? (
              <>
                <div className="review-answer prose">
                  <div className="review-answer-heading">
                    <span>ОТВЕТ ОТКРЫТ</span>
                    <small>Сравните со своим объяснением</small>
                  </div>
                  {card.back}
                </div>
                <Citations citations={card.citations} />
              </>
            ) : (
              <>
                <p className="muted">Произнесите или запишите ответ по памяти.</p>
                <button className="primary" onClick={() => setRevealed(true)}>
                  Открыть ответ
                </button>
              </>
            )}
          </Panel>
          {revealed && (
            <div className="review-assessment">
              <p className="muted small">Насколько самостоятельно вы вспомнили ответ?</p>
              <div className="rating-buttons">
                {[
                  { label: 'Снова', key: 'again', value: Rating.Again },
                  { label: 'Трудно', key: 'hard', value: Rating.Hard },
                  { label: 'Хорошо', key: 'good', value: Rating.Good },
                  { label: 'Легко', key: 'easy', value: Rating.Easy },
                ].map((r, i) => (
                  <button
                    key={r.key}
                    disabled={working}
                    className={r.key}
                    onClick={() =>
                      run(async () => {
                        setWorking(true);
                        try {
                          await commit((s) => {
                            const current = s.cards.find((c) => c.id === card.id);
                            if (!current) throw new Error('Эта карточка удалена.');
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
                          setCompleted((value) => value + 1);
                          setRevealed(false);
                        } finally {
                          setWorking(false);
                        }
                      })
                    }
                  >
                    <strong>
                      {r.label}
                      <small>{i + 1}</small>
                    </strong>
                    <span>{intervalLabel(reviewCard(card, r.value as Grade, now).due, now)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <Panel>
          <Empty
            title="Все карточки на сегодня повторены"
            description="Сейчас нет карточек к повторению. Они появятся по расписанию FSRS."
          >
            <CheckCircle2 className="success" size={35} />
          </Empty>
        </Panel>
      )}
      <div className="review-help">
        <span>Пробел — открыть ответ · 1–4 — выбрать оценку</span>
        <span>
          Оценка меняет интервал и подтверждение воспроизведения; «Трудно» — частичный вклад.
        </span>
      </div>
    </>
  );
}
