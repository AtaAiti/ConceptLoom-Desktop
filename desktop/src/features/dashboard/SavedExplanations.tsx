import { useId, useMemo, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Panel } from '../../components/ui';
import type { Workspace } from '../../types/state';
import type { Commit } from '../../hooks/useWorkspace';
import { Citations } from '../library/SourceContext';
import { SaveExplanationButton } from '../tutor/SaveExplanationButton';
import { hasChangedEvidence, savedExplanations } from '../tutor/savedExplanations';

const batchSize = 10;
const formatDate = (value: string) => new Date(value).toLocaleDateString('ru-RU');

export function SavedExplanations({
  state,
  commit,
  navigate,
}: {
  state: Workspace;
  commit: Commit;
  navigate: (page: string) => void;
}) {
  const [courseId, setCourseId] = useState('');
  const [limit, setLimit] = useState(batchSize);
  const [openedId, setOpenedId] = useState<string>();
  const filterId = useId();
  const saved = useMemo(
    () => savedExplanations(state),
    [state.messages, state.courses, state.activeWorkspaceId],
  );
  const courses = state.courses.filter((c) => c.workspaceId === state.activeWorkspaceId);
  const filter = courses.some((c) => c.id === courseId) ? courseId : '';
  const filtered = saved.filter((m) => !filter || m.courseId === filter);
  // Keep reading after removing a bookmark, until the user closes the dialog.
  const opened = state.messages.find(
    (m) => m.id === openedId && m.role === 'assistant' && courses.some((c) => c.id === m.courseId),
  );
  const course = courses.find((c) => c.id === opened?.courseId);
  const question =
    opened &&
    state.messages.find(
      (m) => m.id === opened.replyTo && m.courseId === opened.courseId && m.role === 'user',
    );
  const changedEvidence = useMemo(
    () => (opened ? hasChangedEvidence(state, opened) : false),
    [state.sources, state.activeWorkspaceId, opened],
  );
  return (
    <Panel className="saved-explanations">
      <div className="section-line">
        <h2>
          <Bookmark size={20} aria-hidden="true" /> Сохранённые объяснения
        </h2>
        <span className="muted small">{saved.length}</span>
      </div>
      <p className="muted small">
        Ответы репетитора с исходными цитатами. Закладки не меняют прогресс обучения.
      </p>
      {courses.length > 1 && saved.length > 0 && (
        <div className="saved-explanation-filter">
          <label htmlFor={filterId}>Учебное направление</label>
          <select
            id={filterId}
            value={filter}
            onChange={(e) => {
              setCourseId(e.target.value);
              setLimit(batchSize);
            }}
          >
            <option value="">Все направления</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!saved.length ? (
        <div className="saved-explanations-empty">
          <p>Здесь появятся ответы, которые вы захотите перечитать.</p>
          <p className="muted small">
            В переписке нажмите «Сохранить объяснение» под полезным ответом.
          </p>
          <button className="secondary" onClick={() => navigate('AI Tutor')}>
            Открыть репетитора
          </button>
        </div>
      ) : !filtered.length ? (
        <p className="muted">В этом направлении пока нет сохранённых объяснений.</p>
      ) : (
        <>
          <ul className="saved-explanation-list">
            {filtered.slice(0, limit).map((message) => (
              <li key={message.id}>
                <button className="saved-explanation-card" onClick={() => setOpenedId(message.id)}>
                  <span className="muted small">
                    {courses.find((c) => c.id === message.courseId)?.name} ·{' '}
                    {formatDate(message.savedAt!)}
                  </span>
                  <span className="saved-explanation-preview">
                    {message.content.slice(0, 200)}
                    {message.content.length > 200 ? '…' : ''}
                  </span>
                  <span className="accent small">
                    {message.citations?.length
                      ? `${message.citations.length} цитат · `
                      : 'Без цитат · '}
                    Открыть объяснение →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > limit && (
            <button className="secondary" onClick={() => setLimit((value) => value + batchSize)}>
              Показать ещё ({filtered.length - limit})
            </button>
          )}
        </>
      )}
      <p className="muted small">
        Закладки хранятся вместе с перепиской направления и удаляются при его удалении.
      </p>
      {opened && (
        <Dialog label="Сохранённое объяснение" onClose={() => setOpenedId(undefined)}>
          <section className="modal saved-explanation-detail">
            <div className="section-line">
              <h2>Объяснение репетитора</h2>
              <button className="secondary" autoFocus onClick={() => setOpenedId(undefined)}>
                Закрыть объяснение
              </button>
            </div>
            <p className="muted small">
              {course?.name} · Ответ от {formatDate(opened.createdAt)}
              {opened.savedAt ? ` · Сохранено ${formatDate(opened.savedAt)}` : ' · Закладка убрана'}
            </p>
            {question && (
              <div className="saved-explanation-question">
                <strong>Ваш вопрос</strong>
                <p className="prose">{question.content}</p>
              </div>
            )}
            <p className="prose saved-explanation-content">{opened.content}</p>
            <p className="muted small">
              Объяснение ИИ. Проверяйте утверждения по материалам источников.
            </p>
            {changedEvidence && (
              <p className="notice" role="status">
                Источник удалён или фрагмент изменился. Показаны цитаты, сохранённые вместе с
                ответом.
              </p>
            )}
            <Citations key={opened.id} citations={opened.citations} />
            {!opened.citations?.length && (
              <p className="muted small">В этом ответе нет цитат из источников.</p>
            )}
            <SaveExplanationButton
              key={opened.id}
              message={opened}
              workspaceId={state.activeWorkspaceId}
              commit={commit}
            />
          </section>
        </Dialog>
      )}
    </Panel>
  );
}
