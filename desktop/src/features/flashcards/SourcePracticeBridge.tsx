import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Dialog } from '../../components/Dialog';
import { Field, errorMessage } from '../../components/ui';
import type { Workspace } from '../../types/state';
import type { PinnedSource } from '../../types/sources';
import type { Commit } from '../../hooks/useWorkspace';
import type { AIProvider } from '../../ai/providers/types';
import {
  appendSourceCards,
  generateSourcePractice,
  normalizeCardFront,
  type PracticeDraft,
} from '../../ai/sourcePractice';
import { sourceSelectionOptions, type SourceSelection } from '../library/sourceSelection';
import { CardFields } from './CardFields';

const PracticeContext = createContext<((value: SourceSelection) => void) | null>(null);
export function SourcePracticeButton(props: SourceSelection & { onSelect?: () => void }) {
  const start = useContext(PracticeContext);
  return start ? (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        start(props);
        props.onSelect?.();
      }}
    >
      Закрепить · 2 карточки
    </button>
  ) : null;
}
type Phase = 'config' | 'generating' | 'review' | 'saving' | 'success';
export function SourcePracticeBridge({
  state,
  courseId,
  provider,
  commit,
  createCourse,
  openCards,
  children,
}: {
  state: Workspace;
  courseId?: string;
  provider: AIProvider;
  commit: Commit;
  createCourse: () => void;
  openCards: (courseId: string) => void;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [chosen, setChosen] = useState('');
  const [destination, setDestination] = useState('');
  const [topicId, setTopicId] = useState('');
  const [phase, setPhase] = useState<Phase>('config');
  const [snapshot, setSnapshot] = useState<PinnedSource | null>(null);
  const [drafts, setDrafts] = useState<PracticeDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const courses = state.courses.filter((c) => c.workspaceId === state.activeWorkspaceId);
  const course = courses.find((c) => c.id === destination);
  const topics = state.topics.filter((t) => t.courseId === destination);
  const { options, sourceError } = useMemo(() => {
    if (!selection) return { options: [] as PinnedSource[], sourceError: '' };
    try {
      return { options: sourceSelectionOptions(state, selection), sourceError: '' };
    } catch (e) {
      return { options: [] as PinnedSource[], sourceError: errorMessage(e) };
    }
  }, [state.sources, state.activeWorkspaceId, selection]);
  const pinned = snapshot ?? options.find((p) => p.chunkId === chosen);
  const busy = phase === 'generating' || phase === 'saving';
  const selected = drafts.filter((d) => selectedIds.includes(d.id));
  const validSelection =
    selected.length > 0 && selected.every((d) => d.front.trim() && d.back.trim());
  const validTarget = !!course && (!topicId || topics.some((t) => t.id === topicId));
  const close = () => {
    if (phase === 'saving') return;
    epoch.current++;
    inFlight.current = false;
    setSelection(null);
  };
  async function generate() {
    if (inFlight.current || !pinned || !validTarget || sourceError) return;
    const token = ++epoch.current;
    inFlight.current = true;
    setPhase('generating');
    setError('');
    setSnapshot(pinned);
    try {
      const result = await generateSourcePractice(
        provider,
        state,
        { workspaceId: state.activeWorkspaceId, courseId: destination, topicId: topicId || null },
        pinned,
      );
      if (token !== epoch.current) return;
      setDrafts(result);
      setSelectedIds(result.map((d) => d.id));
      setPhase('review');
    } catch (e) {
      if (token !== epoch.current) return;
      setError(
        e instanceof Error && e.name === 'ZodError'
          ? 'Модель не вернула две корректные разные карточки. Ничего не сохранено. Повторите создание или выберите другой фрагмент.'
          : errorMessage(e),
      );
      setSnapshot(null);
      setPhase('config');
    } finally {
      if (token === epoch.current) inFlight.current = false;
    }
  }
  async function save() {
    if (inFlight.current || !pinned || !validTarget || !validSelection || sourceError) return;
    const token = ++epoch.current;
    inFlight.current = true;
    setPhase('saving');
    setError('');
    try {
      await commit((latest) =>
        appendSourceCards(
          latest,
          { workspaceId: state.activeWorkspaceId, courseId: destination, topicId: topicId || null },
          pinned,
          drafts,
          selectedIds,
        ),
      );
      if (token === epoch.current) setPhase('success');
    } catch (e) {
      if (token !== epoch.current) return;
      setError(
        `Карточки не сохранены. ${errorMessage(e)} Черновики сохранены в этом окне — повторите добавление.`,
      );
      setPhase('review');
    } finally {
      if (token === epoch.current) inFlight.current = false;
    }
  }
  return (
    <PracticeContext.Provider
      value={(value) => {
        epoch.current++;
        inFlight.current = false;
        setSelection(value);
        setDestination(courses.some((c) => c.id === courseId) ? courseId! : '');
        setTopicId('');
        setSnapshot(null);
        setDrafts([]);
        setSelectedIds([]);
        setPhase('config');
        setError('');
        try {
          const available = sourceSelectionOptions(state, value);
          setChosen(available.length === 1 ? available[0].chunkId : '');
        } catch {
          setChosen('');
        }
      }}
    >
      {children}
      {selection && (
        <Dialog label="Карточки из фрагмента" onClose={close}>
          <section className="modal source-practice">
            <div className="section-line">
              <h2>Закрепить фрагмент</h2>
              <button className="secondary" autoFocus disabled={phase === 'saving'} onClick={close}>
                {phase === 'success' ? 'Готово' : 'Закрыть'}
              </button>
            </div>
            <p className="muted small">
              Один запрос → два черновика. Проверьте ответы по фрагменту и выберите, что добавить в
              повторение.
            </p>
            {sourceError && <p role="alert">{sourceError}</p>}
            {!sourceError && !options.length && (
              <p>На этой странице нет читаемого текста. Выберите другую страницу.</p>
            )}
            {phase === 'config' && options.length > 1 && (
              <Field label="Фрагмент для карточек">
                <select
                  aria-label="Фрагмент для карточек"
                  value={chosen}
                  onChange={(e) => setChosen(e.target.value)}
                >
                  <option value="">Выберите фрагмент</option>
                  {options.map((p, i) => (
                    <option key={p.chunkId} value={p.chunkId}>
                      {i + 1}. {p.excerpt.slice(0, 90)}…
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {courses.length ? (
              <div className="practice-destination">
                <Field label="Учебное направление">
                  <select
                    aria-label="Направление для карточек"
                    disabled={phase !== 'config'}
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      setTopicId('');
                    }}
                  >
                    <option value="">Выберите направление</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Понятие (необязательно)">
                  <select
                    aria-label="Понятие для карточек"
                    disabled={phase !== 'config'}
                    value={topicId}
                    onChange={(e) => setTopicId(e.target.value)}
                  >
                    <option value="">Без привязки к понятию</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <div>
                <p>
                  Сначала создайте учебное направление. Источник уже сохранён — затем вернитесь к
                  нему.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    close();
                    createCourse();
                  }}
                >
                  Создать направление
                </button>
              </div>
            )}
            <div className="practice-review">
              {pinned && (
                <aside className="practice-evidence">
                  <strong>
                    {pinned.title}
                    {pinned.page ? ` · с. ${pinned.page}` : ' · фрагмент'}
                  </strong>
                  <blockquote
                    className="practice-quote"
                    tabIndex={0}
                    aria-label="Исходный фрагмент"
                  >
                    {pinned.excerpt}
                  </blockquote>
                  <p className="muted small">
                    Карточки создаются только по этому фрагменту. Настройки источников направления
                    не меняются.
                  </p>
                </aside>
              )}
              <div>
                {phase === 'generating' && (
                  <p role="status">Создаём 2 черновика… Их просмотр не изменяет прогресс.</p>
                )}
                {drafts.map((draft, index) => {
                  const duplicate =
                    state.cards.some(
                      (c) =>
                        c.courseId === destination &&
                        c.id !== draft.id &&
                        normalizeCardFront(c.front) === normalizeCardFront(draft.front),
                    ) ||
                    drafts.some(
                      (d) =>
                        d.id !== draft.id &&
                        normalizeCardFront(d.front) === normalizeCardFront(draft.front),
                    );
                  return (
                    <fieldset className="practice-draft" key={draft.id}>
                      <legend>Карточка {index + 1}</legend>
                      <label className="practice-choice">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(draft.id)}
                          disabled={busy || phase === 'success'}
                          onChange={(e) =>
                            setSelectedIds((ids) =>
                              e.target.checked
                                ? [...ids, draft.id]
                                : ids.filter((id) => id !== draft.id),
                            )
                          }
                        />
                        Добавить карточку {index + 1}
                      </label>
                      <CardFields
                        front={draft.front}
                        back={draft.back}
                        disabled={busy || phase === 'success'}
                        onChange={(value) =>
                          setDrafts((items) =>
                            items.map((d) => (d.id === draft.id ? { ...d, ...value } : d)),
                          )
                        }
                      />
                      {duplicate && (
                        <p className="muted small">
                          Похожий вопрос уже есть в направлении или среди черновиков. Измените его
                          или снимите выбор, если повтор не нужен.
                        </p>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </div>
            {error && <p role="alert">{error}</p>}
            {phase === 'config' && courses.length > 0 && (
              <button
                className="primary"
                disabled={!pinned || !validTarget || !!sourceError}
                onClick={generate}
              >
                Создать 2 карточки
              </button>
            )}
            {(phase === 'review' || phase === 'saving') && (
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !validSelection || !validTarget || !!sourceError}
                  onClick={save}
                >
                  {phase === 'saving'
                    ? 'Сохраняем карточки…'
                    : `Добавить в повторение (${selected.length})`}
                </button>
                <span className="muted small">
                  Без проверки знаний и изменения существующих карточек.
                </span>
              </div>
            )}
            {phase === 'success' && (
              <div>
                <p role="status">Сохранено: {selected.length}. Карточки добавлены в повторение.</p>
                <button
                  className="primary"
                  onClick={() => {
                    close();
                    openCards(destination);
                  }}
                >
                  Открыть карточки
                </button>
              </div>
            )}
          </section>
        </Dialog>
      )}
    </PracticeContext.Provider>
  );
}
