import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Field, errorMessage } from '../../components/ui';
import type { Course, Workspace } from '../../types/state';
import type { Commit } from '../../hooks/useWorkspace';
import type { AIProvider } from '../../ai/providers/types';
import {
  COMPARISON_MISSING,
  comparisonRequestSchema,
  generateSourceComparison,
  saveSourceComparison,
  type ComparisonDraft,
} from '../../ai/sourceComparison';
import { selectedSources } from '../library/sourceIndex';
import { Citations } from '../library/SourceContext';
import { SaveExplanationButton } from './SaveExplanationButton';
import { hasChangedEvidence } from './savedExplanations';

export function SourceComparisonDialog({
  state,
  course,
  topicId,
  pinnedSourceId,
  provider,
  commit,
  onClose,
  openSources,
}: {
  state: Workspace;
  course: Course;
  topicId?: string;
  pinnedSourceId?: string;
  provider: AIProvider;
  commit: Commit;
  onClose: () => void;
  openSources: () => void;
}) {
  const [a, setA] = useState(
    state.topics.find((t) => t.id === topicId && t.courseId === course.id)?.title ?? '',
  );
  const [b, setB] = useState('');
  const [sourceIds, setSourceIds] = useState<string[]>(() =>
    pinnedSourceId && state.sources.some((s) => s.id === pinnedSourceId)
      ? [pinnedSourceId]
      : selectedSources(state, course.sourceScope ?? { kind: 'none' }).map((s) => s.id),
  );
  const [draft, setDraft] = useState<ComparisonDraft | null>(null);
  const [phase, setPhase] = useState<'idle' | 'generating' | 'saving'>('idle');
  const [error, setError] = useState('');
  const epoch = useRef(0),
    inFlight = useRef(false);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const request = useMemo(
    () => ({ workspaceId: state.activeWorkspaceId, courseId: course.id, topicId, a, b, sourceIds }),
    [state.activeWorkspaceId, course.id, topicId, a, b, sourceIds],
  );
  const valid = comparisonRequestSchema.safeParse(request).success;
  const busy = phase !== 'idle';
  const stored = draft
    ? state.messages.find(
        (m) =>
          m.id === draft.answerId &&
          m.courseId === course.id &&
          m.role === 'assistant' &&
          m.replyTo === draft.userId,
      )
    : undefined;
  const close = () => {
    if (phase !== 'saving') {
      epoch.current++;
      onClose();
    }
  };
  async function persist(value: ComparisonDraft, token: number) {
    setPhase('saving');
    try {
      await commit((latest) => saveSourceComparison(latest, value));
    } catch (e) {
      if (token === epoch.current)
        setError(
          `Сравнение не записано в беседу. ${errorMessage(e)} Результат остаётся в окне; можно повторить запись без запроса к ИИ.`,
        );
    }
  }
  async function generate() {
    if (!valid || inFlight.current) return;
    const token = ++epoch.current;
    inFlight.current = true;
    setPhase('generating');
    setError('');
    try {
      const result = await generateSourceComparison(provider, state, request);
      if (token !== epoch.current) return;
      setDraft(result);
      await persist(result, token);
    } catch (e) {
      if (token === epoch.current)
        setError(
          e instanceof Error && e.name === 'ZodError'
            ? 'Модель вернула некорректное сравнение или неверные ссылки. Ничего не записано. Повторите запрос или выберите другую модель.'
            : errorMessage(e),
        );
    } finally {
      if (token === epoch.current) {
        inFlight.current = false;
        setPhase('idle');
      }
    }
  }
  async function retrySave() {
    if (!draft || inFlight.current) return;
    const token = ++epoch.current;
    inFlight.current = true;
    setError('');
    try {
      await persist(draft, token);
    } finally {
      if (token === epoch.current) {
        inFlight.current = false;
        setPhase('idle');
      }
    }
  }
  return (
    <Dialog label="Сравнить понятия" onClose={close}>
      <section className="modal source-comparison">
        <h2>Сравнить два понятия</h2>
        <p className="muted">
          Три критерия, подтверждения для каждой стороны и один вопрос на применение.
        </p>
        <details open={!draft}>
          <summary tabIndex={0}>
            {draft
              ? `${draft.request.a} ↔ ${draft.request.b} · источников: ${draft.request.sourceIds.length}`
              : 'Параметры сравнения'}
          </summary>
          <div className="comparison-inputs">
            <Field label="Первое понятие">
              <input
                maxLength={100}
                value={a}
                disabled={busy || !!draft}
                onChange={(e) => setA(e.target.value)}
                placeholder="Например, атомарность"
              />
            </Field>
            <Field label="Второе понятие">
              <input
                maxLength={100}
                value={b}
                disabled={busy || !!draft}
                onChange={(e) => setB(e.target.value)}
                placeholder="Например, изоляция"
              />
            </Field>
          </div>
          <fieldset className="comparison-sources" disabled={busy || !!draft}>
            <legend>Источники для сравнения</legend>
            {state.sources.length ? (
              state.sources.map((source) => (
                <label key={source.id}>
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(source.id)}
                    onChange={(e) =>
                      setSourceIds((ids) =>
                        e.target.checked
                          ? [...ids, source.id]
                          : ids.filter((id) => id !== source.id),
                      )
                    }
                  />
                  {source.title}
                </label>
              ))
            ) : (
              <p>Здесь пока нет источников. Добавьте PDF или текст в библиотеку.</p>
            )}
          </fieldset>
          {!sourceIds.length && (
            <p className="notice">
              Выберите хотя бы один источник. Для каждого понятия лучше использовать название из
              текста.
            </p>
          )}
          {a.trim() &&
            b.trim() &&
            a.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase() ===
              b.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase() && (
              <p role="alert">Выберите два разных понятия.</p>
            )}
          <p className="small muted">
            Сравнение — только по выбранным источникам, даже если обычный репетитор использует общие
            знания. Поиск выбирает до трёх отрывков для каждой стороны; отсутствие совпадений не
            доказывает отсутствие информации во всём документе. Отобранный текст будет передан
            модели {state.settings.model} ({state.settings.provider}).
          </p>
        </details>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          {!draft ? (
            <button className="primary" disabled={!valid || busy} onClick={generate}>
              {phase === 'generating' ? 'Сравниваем…' : 'Сравнить по источникам'}
            </button>
          ) : (
            <>
              {!stored && (
                <button className="primary" disabled={busy} onClick={retrySave}>
                  Повторить запись в беседу
                </button>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError('');
                }}
              >
                Новое сравнение
              </button>
            </>
          )}
          {!state.sources.length && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                close();
                openSources();
              }}
            >
              Добавить источники
            </button>
          )}
          <button className="secondary" disabled={phase === 'saving'} onClick={close}>
            {stored ? 'Вернуться в беседу' : 'Закрыть сравнение'}
          </button>
        </div>
        {busy && (
          <p role="status">
            {phase === 'generating'
              ? 'Ищем подтверждения отдельно для каждого понятия… Окно можно закрыть, поздний результат будет отменён.'
              : 'Записываем сравнение в беседу…'}
          </p>
        )}
        {draft && (
          <article className="comparison-result" aria-label="Результат сравнения">
            {stored ? (
              <>
                <p role="status">Сравнение записано в беседу.</p>
                <SaveExplanationButton
                  message={stored}
                  workspaceId={state.activeWorkspaceId}
                  commit={commit}
                />
              </>
            ) : (
              <p className="notice">Результат ещё не записан в беседу.</p>
            )}
            <p className="muted small">
              Найденные отрывки: {draft.request.a} — {draft.chunks.a.length}; {draft.request.b} —{' '}
              {draft.chunks.b.length}.
            </p>
            {stored && hasChangedEvidence(state, stored) && (
              <p className="notice">
                Подтверждения изменились или удалены. Это сохранённое сравнение прежних отрывков.
              </p>
            )}
            {draft.result.rows.map((row, i) => (
              <section className="comparison-row" key={i} aria-label={`Критерий ${i + 1}`}>
                <h3>{row.criterion}</h3>
                <div className="comparison-cells">
                  {(['a', 'b'] as const).map((side) => (
                    <div
                      key={side}
                      className={row[side].text === null ? 'comparison-missing' : ''}
                      aria-label={`${draft.request[side]} — ${row.criterion}`}
                    >
                      <h4>{draft.request[side]}</h4>
                      <p>{row[side].text ?? COMPARISON_MISSING}</p>
                      <Citations
                        citations={draft.citations.filter((c) =>
                          row[side].citationIds.includes(c.chunkId),
                        )}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <h3>Вопрос на применение</h3>
            <p>{draft.result.applicationQuestion}</p>
            <p className="muted small">Без автоматической оценки и изменения учебного прогресса.</p>
          </article>
        )}
      </section>
    </Dialog>
  );
}
