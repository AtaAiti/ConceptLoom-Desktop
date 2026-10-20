import { useState } from 'react';
import type { Course, Workspace } from '../../types/state';
import type { SourceCitation, SourceScope } from '../../types/sources';
import type { Commit } from '../../hooks/useWorkspace';
import { selectedSources } from './sourceIndex';

export function SourceContext({
  state,
  course,
  commit,
  run,
}: {
  state: Workspace;
  course: Course;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
}) {
  const scope = course.sourceScope ?? { kind: 'none' };
  const save = (sourceScope: SourceScope) =>
    run(() =>
      commit((s) => ({
        ...s,
        courses: s.courses.map((c) => (c.id === course.id ? { ...c, sourceScope } : c)),
      })),
    );
  return (
    <section className="source-context" aria-label="Source context">
      <label>
        Источники{' '}
        <select
          aria-label="Source scope"
          value={scope.kind === 'library' ? `library:${scope.libraryId}` : scope.kind}
          onChange={(e) => {
            const v = e.target.value;
            save(
              v.startsWith('library:')
                ? { kind: 'library', libraryId: v.slice(8) }
                : v === 'selected'
                  ? { kind: 'selected', sourceIds: [] }
                  : { kind: v as 'all' | 'none' },
            );
          }}
        >
          <option value="none">Без источников</option>
          <option value="all">Все источники пространства</option>
          <option value="selected">Выбранные источники</option>
          {state.libraries.map((l) => (
            <option key={l.id} value={`library:${l.id}`}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {scope.kind !== 'none' && (
        <label>
          Режим ответа{' '}
          <select
            aria-label="Source answer mode"
            value={course.sourceMode ?? 'sources-only'}
            onChange={(e) => {
              const mode = e.target.value as 'sources-only' | 'mixed';
              run(() =>
                commit((s) => ({
                  ...s,
                  courses: s.courses.map((c) =>
                    c.id === course.id ? { ...c, sourceMode: mode } : c,
                  ),
                })),
              );
            }}
          >
            <option value="sources-only">Только источники</option>
            <option value="mixed">Источники + общие знания</option>
          </select>
        </label>
      )}
      <div className="source-chips">
        {scope.kind === 'selected'
          ? state.sources.map((source) => (
              <label key={source.id}>
                <input
                  type="checkbox"
                  checked={scope.sourceIds.includes(source.id)}
                  onChange={(e) =>
                    save({
                      kind: 'selected',
                      sourceIds: e.target.checked
                        ? [...scope.sourceIds, source.id]
                        : scope.sourceIds.filter((id) => id !== source.id),
                    })
                  }
                />
                {source.title}
              </label>
            ))
          : selectedSources(state, scope).map((s) => <span key={s.id}>{s.title}</span>)}
      </div>
    </section>
  );
}
export function Citations({ citations = [] }: { citations?: SourceCitation[] }) {
  const [opened, setOpened] = useState<SourceCitation | null>(null);
  if (!citations.length) return null;
  return (
    <div className="citations">
      <span className="eyebrow">ИСТОЧНИК</span>
      {citations.map((c) => (
        <button key={c.chunkId} className="text-button" onClick={() => setOpened(c)}>
          {c.title}
          {c.page ? ` · с. ${c.page}` : ' · фрагмент'}
        </button>
      ))}
      {opened && (
        <div
          className="modal-backdrop"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpened(null);
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-label="Source excerpt">
            <h2>
              {opened.title}
              {opened.page ? ` · Страница ${opened.page}` : ''}
            </h2>
            <p className="prose">{opened.excerpt}</p>
            <p className="muted small">
              Passage supplied to the selected AI model. Check its interpretation against this
              evidence.
            </p>
            <button autoFocus className="secondary" onClick={() => setOpened(null)}>
              Закрыть фрагмент
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
