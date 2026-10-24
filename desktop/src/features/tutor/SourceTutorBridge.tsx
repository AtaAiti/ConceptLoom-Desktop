import { createContext, useContext, useState, type ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/ui';
import type { Workspace } from '../../types/state';
import type { PinnedSource, SourceCitation } from '../../types/sources';
import { pageChunks, resolveCitations, resolvePinnedSource } from '../library/sourceIndex';

type Selection = { sourceId: string; pageIndex: number } | { citation: SourceCitation };
const SourceTutorContext = createContext<((selection: Selection) => void) | null>(null);

export function SourceTutorButton(
  props: Selection & { disabled?: boolean; onSelect?: () => void },
) {
  const ask = useContext(SourceTutorContext);
  return ask ? (
    <button
      type="button"
      className="secondary"
      disabled={props.disabled}
      onClick={() => {
        ask(props);
        props.onSelect?.();
      }}
    >
      Разобрать с репетитором
    </button>
  ) : null;
}

export function SourceTutorBridge({
  state,
  courseId,
  start,
  createCourse,
  children,
}: {
  state: Workspace;
  courseId?: string;
  start: (courseId: string, pinned: PinnedSource) => void;
  createCourse: () => void;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [chosen, setChosen] = useState('');
  const [destination, setDestination] = useState('');
  function options(value: Selection): PinnedSource[] {
    if ('citation' in value) {
      const pinned = { ...value.citation, workspaceId: state.activeWorkspaceId };
      resolvePinnedSource(state, pinned);
      return [pinned];
    }
    const source = state.sources.find(
      (s) => s.id === value.sourceId && s.workspaceId === state.activeWorkspaceId,
    );
    if (!source) throw new Error('Источник больше не доступен. Выберите другой материал.');
    const chunks = pageChunks(source, value.pageIndex);
    return resolveCitations(
      chunks.map((c) => c.id),
      chunks,
      [source],
    ).map((c) => ({ ...c, workspaceId: state.activeWorkspaceId }));
  }
  let excerpts: PinnedSource[] = [],
    error = '';
  if (selection) {
    try {
      excerpts = options(selection);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const pinned = excerpts.find((e) => e.chunkId === chosen);
  return (
    <SourceTutorContext.Provider
      value={(value) => {
        try {
          const available = options(value);
          if (available.length === 1 && state.courses.some((c) => c.id === courseId)) {
            start(courseId!, available[0]);
            return;
          }
          setChosen(available.length === 1 ? available[0].chunkId : '');
        } catch {
          setChosen('');
        }
        setDestination(courseId ?? '');
        setSelection(value);
      }}
    >
      {children}
      {selection && (
        <Dialog label="Разобрать фрагмент" onClose={() => setSelection(null)}>
          <section className="modal">
            <h2>Разобрать фрагмент</h2>
            {error ? (
              <p role="alert">{error}</p>
            ) : !excerpts.length ? (
              <p>На этой странице нет читаемого текста. Выберите другую страницу.</p>
            ) : (
              <>
                {excerpts.length > 1 && (
                  <Field label="Фрагмент страницы">
                    <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
                      <option value="">Выберите фрагмент</option>
                      {excerpts.map((e, index) => (
                        <option key={e.chunkId} value={e.chunkId}>
                          {index + 1}. {e.excerpt.slice(0, 90)}…
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {pinned && <p className="prose handoff-excerpt">{pinned.excerpt}</p>}
                {state.courses.length ? (
                  <Field label="Учебное направление">
                    <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                      <option value="">Выберите направление</option>
                      {state.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <p>
                    Сначала создайте учебное направление. Источник уже сохранён — затем вернитесь к
                    нему.
                  </p>
                )}
              </>
            )}
            <div className="button-row">
              {!state.courses.length && (
                <button
                  className="primary"
                  onClick={() => {
                    setSelection(null);
                    createCourse();
                  }}
                >
                  Создать направление
                </button>
              )}
              {!!state.courses.length && (
                <button
                  className="primary"
                  disabled={!pinned || !state.courses.some((c) => c.id === destination)}
                  onClick={() => {
                    if (pinned) {
                      start(destination, pinned);
                      setSelection(null);
                    }
                  }}
                >
                  Открыть репетитора
                </button>
              )}
              <button className="secondary" onClick={() => setSelection(null)}>
                Отмена
              </button>
            </div>
          </section>
        </Dialog>
      )}
    </SourceTutorContext.Provider>
  );
}
