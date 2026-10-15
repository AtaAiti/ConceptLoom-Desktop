import { useState } from 'react';
import { Field, PageHeading, Panel } from '../../components/ui';
import { removeWorkspace } from '../../db/workspaces';
import type { Workspace } from '../../types/state';
import { defaultWorkspace, type WorkspaceInfo } from '../../types/sources';
import type { Commit } from '../../hooks/useWorkspace';
import { statistics } from '../../learning/planner';

export function Workspaces({
  state,
  commit,
  open,
  run,
}: {
  state: Workspace;
  commit: Commit;
  open: (id: string) => void;
  run: (task: () => Promise<void>) => void;
}) {
  const [edit, setEdit] = useState<WorkspaceInfo | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceInfo | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const stats = statistics(state);
  const due = state.cards.filter((c) => new Date(c.due) <= new Date()).length;
  const update = (workspace: WorkspaceInfo) =>
    commit((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
    }));
  return (
    <>
      <PageHeading
        eyebrow="HOME / YOUR LEARNING"
        title="A place for every curiosity."
        description={`${due} reviews due across your workspaces · ${stats.streak} day streak · daily goal ${state.settings.dailyMinutes} minutes`}
        action={
          <button
            className="primary"
            onClick={() => {
              const now = new Date().toISOString();
              setEdit({
                ...defaultWorkspace(),
                id: crypto.randomUUID(),
                name: '',
                createdAt: now,
                updatedAt: now,
                lastOpenedAt: now,
              });
            }}
          >
            Create workspace
          </button>
        }
      />
      <div className="flashcard-grid">
        {[...state.workspaces]
          .sort(
            (a, b) =>
              Number(b.pinned) - Number(a.pinned) || b.lastOpenedAt.localeCompare(a.lastOpenedAt),
          )
          .map((w) => {
            const courses = state.courses.filter((c) => c.workspaceId === w.id);
            const ids = new Set(courses.map((c) => c.id));
            return (
              <Panel key={w.id} title={`${w.icon} ${w.name}`}>
                <p className="muted">
                  {w.description || w.goal || 'Your materials, connections and practice.'}
                </p>
                <p className="small">
                  {courses.length} study paths ·{' '}
                  {state.sources.filter((s) => s.workspaceId === w.id).length} sources ·{' '}
                  {
                    state.cards.filter((c) => ids.has(c.courseId) && new Date(c.due) <= new Date())
                      .length
                  }{' '}
                  reviews due
                </p>
                {w.archived && <span className="status-pill">Archived</span>}
                <div className="button-row">
                  {!w.archived && (
                    <button className="primary compact" onClick={() => open(w.id)}>
                      Open workspace
                    </button>
                  )}
                  <button className="secondary" onClick={() => setEdit(w)}>
                    Edit
                  </button>
                  <button
                    className="text-button"
                    onClick={() => run(() => update({ ...w, pinned: !w.pinned }))}
                  >
                    {w.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      run(async () => {
                        const replacement = state.workspaces.find(
                          (x) => x.id !== w.id && !x.archived,
                        );
                        if (!w.archived && !replacement)
                          throw new Error('Keep at least one active workspace.');
                        await commit((s) => ({
                          ...s,
                          workspaces: s.workspaces.map((x) =>
                            x.id === w.id ? { ...x, archived: !x.archived } : x,
                          ),
                          activeWorkspaceId:
                            s.activeWorkspaceId === w.id && !w.archived
                              ? replacement!.id
                              : s.activeWorkspaceId,
                        }));
                      })
                    }
                  >
                    {w.archived ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      setDeleting(w);
                      setConfirmation('');
                    }}
                  >
                    Delete
                  </button>
                </div>
              </Panel>
            );
          })}
      </div>
      {edit && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-label="Workspace details"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await commit((s) => ({
                  ...s,
                  workspaces: s.workspaces.some((w) => w.id === edit.id)
                    ? s.workspaces.map((w) =>
                        w.id === edit.id ? { ...edit, updatedAt: new Date().toISOString() } : w,
                      )
                    : [...s.workspaces, edit],
                }));
                setEdit(null);
                if (!edit.archived) open(edit.id);
              });
            }}
          >
            <h2>Workspace details</h2>
            <Field label="Workspace name">
              <input
                autoFocus
                required
                maxLength={100}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                maxLength={2000}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </Field>
            <Field label="Learning goal">
              <textarea
                maxLength={2000}
                value={edit.goal}
                onChange={(e) => setEdit({ ...edit, goal: e.target.value })}
              />
            </Field>
            <Field label="Icon">
              <input
                maxLength={8}
                value={edit.icon}
                onChange={(e) => setEdit({ ...edit, icon: e.target.value })}
              />
            </Field>
            <Field label="Accent">
              <select
                value={edit.accent}
                onChange={(e) =>
                  setEdit({ ...edit, accent: e.target.value as WorkspaceInfo['accent'] })
                }
              >
                {['violet', 'mint', 'blue', 'amber'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <div className="button-row">
              <button className="primary">Save workspace</button>
              <button type="button" className="secondary" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-label="Delete workspace">
            <h2>Delete {deleting.name}?</h2>
            <p>
              All its sources, paths, cards and learning history will be permanently removed. Type
              the workspace name to confirm.
            </p>
            <Field label="Confirm workspace name">
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
            <div className="button-row">
              <button
                className="primary"
                disabled={confirmation !== deleting.name}
                onClick={() =>
                  run(async () => {
                    await commit((s) => removeWorkspace(s, deleting.id));
                    setDeleting(null);
                  })
                }
              >
                Permanently delete
              </button>
              <button className="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
