import { Field } from '../../components/ui';
import type { Workspace } from '../../types/state';
import type { Source } from '../../types/sources';
import type { Commit } from '../../hooks/useWorkspace';

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
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-label="Edit source"
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
            <Field label="Source title">
              <input
                required
                value={edit.title}
                maxLength={200}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Tags (comma separated)">
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
            <Field label="Move to library">
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
              <legend>Attach to study paths</legend>
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
              <button className="primary">Save source</button>
              <button type="button" className="secondary" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {preview && (
        <div className="modal-backdrop">
          <section className="modal wide" role="dialog" aria-label="Source preview">
            <h2>{preview.title}</h2>
            <div className="button-row">
              <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous page
              </button>
              <span>
                Page {preview.pages[page].page ?? 1} / {preview.pages.length}
              </span>
              <button
                className="secondary"
                disabled={page >= preview.pages.length - 1}
                onClick={() => setPage(page + 1)}
              >
                Next page
              </button>
              <button autoFocus className="secondary" onClick={() => setPreview(null)}>
                Close preview
              </button>
            </div>
            <p className="prose source-page">{preview.pages[page].text}</p>
          </section>
        </div>
      )}
      {removing && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-label="Remove source">
            <h2>Remove {removing.title}?</h2>
            <p>
              Its local index will be removed. Generated lessons retain their cited excerpts. Your
              original file is unchanged.
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
                Delete source
              </button>
              <button className="secondary" onClick={() => setRemoving(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
