import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/ui';
import type { Workspace } from '../../types/state';
import type { Source } from '../../types/sources';
import type { Commit } from '../../hooks/useWorkspace';
import { SourceTutorButton } from '../tutor/SourceTutorBridge';
import { SourcePracticeButton } from '../flashcards/SourcePracticeBridge';

export function SourceDialogs({
  state,
  commit,
  run,
  edit,
  setEdit,
  preview,
  setPreview,
  page,
  setPage,
  removing,
  setRemoving,
  onRemoved,
}: {
  state: Workspace;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
  edit: Source | null;
  setEdit: (value: Source | null) => void;
  preview: Source | null;
  setPreview: (value: Source | null) => void;
  page: number;
  setPage: (value: number) => void;
  removing: Source | null;
  setRemoving: (value: Source | null) => void;
  onRemoved: () => void;
}) {
  return (
    <>
      {edit && (
        <Dialog label="Изменить источник" onClose={() => setEdit(null)}>
          <form
            className="modal"
            aria-label="Изменить источник"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await commit((s) => ({
                  ...s,
                  sources: s.sources.map((v) => (v.id === edit.id ? edit : v)),
                }));
                setEdit(null);
              });
            }}
          >
            <Field label="Название источника">
              <input
                required
                value={edit.title}
                maxLength={200}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Теги (через запятую)">
              <input
                value={edit.tags.join(',')}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .slice(0, 30),
                  })
                }
              />
            </Field>
            <Field label="Переместить в библиотеку">
              <select
                value={edit.libraryIds[0]}
                onChange={(e) => setEdit({ ...edit, libraryIds: [e.target.value] })}
              >
                {state.libraries.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend>Прикрепить к направлениям</legend>
              {state.courses.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={edit.courseIds.includes(c.id)}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        courseIds: e.target.checked
                          ? [...edit.courseIds, c.id]
                          : edit.courseIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </fieldset>
            <div className="button-row">
              <button className="primary">Сохранить источник</button>
              <button type="button" className="secondary" onClick={() => setEdit(null)}>
                Отмена
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {preview && (
        <Dialog label="Предпросмотр источника" onClose={() => setPreview(null)}>
          <section className="modal wide" aria-label="Предпросмотр источника">
            <h2>{preview.title}</h2>
            <div className="button-row">
              <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Предыдущая страница
              </button>
              <span>
                Страница {preview.pages[page].page ?? 1} / {preview.pages.length}
              </span>
              <button
                className="secondary"
                disabled={page >= preview.pages.length - 1}
                onClick={() => setPage(page + 1)}
              >
                Следующая страница
              </button>
              <button autoFocus className="secondary" onClick={() => setPreview(null)}>
                Закрыть просмотр
              </button>
            </div>
            <p className="prose source-page">{preview.pages[page].text}</p>
            <SourcePracticeButton
              sourceId={preview.id}
              pageIndex={page}
              onSelect={() => setPreview(null)}
            />
            <SourceTutorButton
              sourceId={preview.id}
              pageIndex={page}
              disabled={!preview.pages[page].text.trim()}
            />
          </section>
        </Dialog>
      )}
      {removing && (
        <Dialog label="Remove source" onClose={() => setRemoving(null)}>
          <section className="modal" aria-label="Remove source">
            <h2>Удалить {removing.title}?</h2>
            <p>
              Источник и его поисковый индекс будут удалены. Цитаты в готовых занятиях сохранятся.
              Исходный файл останется на прежнем месте.
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    await commit((s) => ({
                      ...s,
                      sources: s.sources.filter((v) => v.id !== removing.id),
                    }));
                    setRemoving(null);
                    onRemoved();
                  })
                }
              >
                Удалить источник
              </button>
              <button className="secondary" onClick={() => setRemoving(null)}>
                Отмена
              </button>
            </div>
          </section>
        </Dialog>
      )}
    </>
  );
}
