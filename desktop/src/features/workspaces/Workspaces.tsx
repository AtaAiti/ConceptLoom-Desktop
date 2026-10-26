import { Dialog } from '../../components/Dialog';
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
        title="Пространства для ваших интересов"
        description={`${due} карточек к повторению · ${stats.streak} дн. подряд · дневная цель ${state.settings.dailyMinutes} мин`}
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
            Создать пространство
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
                  {w.description || w.goal || 'Ваши материалы, связи и практика.'}
                </p>
                <p className="small">
                  {courses.length} направлений ·{' '}
                  {state.sources.filter((s) => s.workspaceId === w.id).length} источников ·{' '}
                  {
                    state.cards.filter((c) => ids.has(c.courseId) && new Date(c.due) <= new Date())
                      .length
                  }{' '}
                  к повторению
                </p>
                {w.archived && <span className="status-pill">В архиве</span>}
                <div className="button-row">
                  {!w.archived && (
                    <button className="primary compact" onClick={() => open(w.id)}>
                      Открыть пространство
                    </button>
                  )}
                  <button className="secondary" onClick={() => setEdit(w)}>
                    Изменить
                  </button>
                  <button
                    className="text-button"
                    onClick={() => run(() => update({ ...w, pinned: !w.pinned }))}
                  >
                    {w.pinned ? 'Открепить' : 'Закрепить'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      run(async () => {
                        const replacement = state.workspaces.find(
                          (x) => x.id !== w.id && !x.archived,
                        );
                        if (!w.archived && !replacement)
                          throw new Error('Оставьте хотя бы одно активное пространство.');
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
                    {w.archived ? 'Восстановить' : 'В архив'}
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      setDeleting(w);
                      setConfirmation('');
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </Panel>
            );
          })}
      </div>
      {edit && (
        <Dialog label="Детали пространства" onClose={() => setEdit(null)}>
          <form
            className="modal"
            aria-label="Детали пространства"
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
            <h2>Детали пространства</h2>
            <Field label="Название пространства">
              <input
                autoFocus
                required
                maxLength={100}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Описание">
              <textarea
                maxLength={2000}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </Field>
            <Field label="Цель обучения">
              <textarea
                maxLength={2000}
                value={edit.goal}
                onChange={(e) => setEdit({ ...edit, goal: e.target.value })}
              />
            </Field>
            <Field label="Значок">
              <input
                maxLength={8}
                value={edit.icon}
                onChange={(e) => setEdit({ ...edit, icon: e.target.value })}
              />
            </Field>
            <Field label="Акцент">
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
              <button className="primary">Сохранить пространство</button>
              <button type="button" className="secondary" onClick={() => setEdit(null)}>
                Отмена
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {deleting && (
        <Dialog label="Удалить пространство" onClose={() => setDeleting(null)}>
          <section className="modal" aria-label="Удалить пространство">
            <h2>Удалить {deleting.name}?</h2>
            <p>
              Все источники, направления, карточки и история обучения этого пространства будут
              удалены. Введите его название для подтверждения.
            </p>
            <Field label="Подтвердите название пространства">
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
                Удалить навсегда
              </button>
              <button className="secondary" onClick={() => setDeleting(null)}>
                Отмена
              </button>
            </div>
          </section>
        </Dialog>
      )}
    </>
  );
}
