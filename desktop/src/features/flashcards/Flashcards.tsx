import { Dialog } from '../../components/Dialog';
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Empty, Field, PageHeading, Panel } from '../../components/ui';
import { newCard } from '../../learning/reviews';
import { Citations } from '../library/SourceContext';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Flashcard, Workspace } from '../../types/state';

export function Flashcards({
  state,
  course,
  commit,
  run,
}: {
  state: Workspace;
  course?: Course;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
}) {
  const [edit, setEdit] = useState<Flashcard | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  if (!course)
    return (
      <Empty title="Make a course first" description="Flashcards belong to your learning paths." />
    );
  const cards = state.cards.filter((c) => c.courseId === course.id);
  return (
    <>
      <PageHeading
        eyebrow="RETRIEVE / FLASHCARDS"
        title="Make knowledge stick."
        description="A useful question today. A stronger memory tomorrow."
        action={
          <button className="primary" onClick={() => setEdit(newCard(course.id, null, '', ''))}>
            <Plus size={16} />
            Создать карточку
          </button>
        }
      />
      <div className="flashcard-grid">
        {cards.map((card) => (
          <Panel key={card.id}>
            <span className="eyebrow">
              {card.reps} REVIEWS · DUE {new Date(card.due).toLocaleDateString()}
            </span>
            <h3>{card.front}</h3>
            <p className="prose">{card.back}</p>
            {card.blocks
              ?.filter((b) => b.type !== 'text')
              .map((b, i) => (
                <p className="prose" key={i}>
                  <strong>{b.type}: </strong>
                  {b.text}
                </p>
              ))}
            <Citations citations={card.citations} />
            <div className="button-row">
              <button className="text-button" onClick={() => setEdit({ ...card })}>
                <Pencil size={14} />
                Изменить
              </button>
              <button className="text-button danger" onClick={() => setRemoving(card.id)}>
                <Trash2 size={14} />
                Удалить
              </button>
            </div>
          </Panel>
        ))}
      </div>
      {!cards.length && (
        <Empty
          title="Your memory starts with a question"
          description="Create a card, or let your AI tutor generate cards from a lesson."
        />
      )}
      {edit && (
        <Dialog label="Карточка" onClose={() => setEdit(null)}>
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await commit((s) => ({
                  ...s,
                  cards: s.cards.some((c) => c.id === edit.id)
                    ? s.cards.map((c) => (c.id === edit.id ? edit : c))
                    : [...s.cards, edit],
                }));
                setEdit(null);
              });
            }}
          >
            <h2>Flashcard</h2>
            <Field label="Лицевая сторона · вопрос">
              <textarea
                required
                value={edit.front}
                onChange={(e) => setEdit({ ...edit, front: e.target.value })}
              />
            </Field>
            <Field label="Обратная сторона · ответ">
              <textarea
                required
                value={edit.back}
                onChange={(e) => setEdit({ ...edit, back: e.target.value })}
              />
            </Field>
            <div className="button-row">
              <button className="primary">Сохранить карточку</button>
              <button type="button" className="secondary" onClick={() => setEdit(null)}>
                Отмена
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {removing && (
        <Dialog label="Удалить карточку" onClose={() => setRemoving(null)}>
          <Panel title="Удалить эту карточку?">
            <p>This also removes its review history. This cannot be undone.</p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    await commit((s) => ({
                      ...s,
                      cards: s.cards.filter((c) => c.id !== removing),
                      reviews: s.reviews.filter((r) => r.cardId !== removing),
                    }));
                    setRemoving(null);
                  })
                }
              >
                Удалить карточку
              </button>
              <button className="secondary" onClick={() => setRemoving(null)}>
                Keep card
              </button>
            </div>
          </Panel>
        </Dialog>
      )}
    </>
  );
}
