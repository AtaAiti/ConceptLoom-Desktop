import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Field, errorMessage } from '../../components/ui';
import type { Workspace } from '../../types/state';
import type { Source } from '../../types/sources';
import type { Commit } from '../../hooks/useWorkspace';
import type { AIProvider } from '../../ai/providers/types';
import {
  generateSourceGuide,
  guideMatches,
  pageLabel,
  prepareGuideSection,
  saveSourceGuide,
  sourceFingerprint,
  type GuideDraft,
} from '../../ai/sourceGuide';
import { Citations } from './SourceContext';
import { SourceTutorButton } from '../tutor/SourceTutorBridge';

export function SourceGuideDialog({
  state,
  sourceId,
  initialIndex,
  outputLanguage,
  provider,
  commit,
  onClose,
}: {
  state: Workspace;
  sourceId: string;
  initialIndex: number;
  outputLanguage: string;
  provider: AIProvider;
  commit: Commit;
  onClose: () => void;
}) {
  const source = state.sources.find((s) => s.id === sourceId);
  const lastIndex = Math.max(0, (source?.pages.length ?? 1) - 1);
  const [startIndex, setStart] = useState(
    Math.max(0, Math.min(source?.guide?.startIndex ?? initialIndex, lastIndex)),
  );
  const [endIndex, setEnd] = useState(
    Math.max(startIndex, Math.min(source?.guide?.endIndex ?? startIndex, lastIndex)),
  );
  const [language, setLanguage] = useState(source?.guide?.outputLanguage ?? outputLanguage);
  const [fingerprint, setFingerprint] = useState<{ pages: Source['pages']; hash: string } | null>(
    null,
  );
  const [pending, setPending] = useState<GuideDraft | null>(null);
  const [phase, setPhase] = useState<'idle' | 'generating' | 'saving'>('idle');
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  useEffect(() => {
    let active = true;
    if (source)
      sourceFingerprint(source)
        .then((hash) => {
          if (active) setFingerprint({ pages: source.pages, hash });
        })
        .catch(() => {
          if (active) setError('Не удалось проверить текст источника. Откройте обзор заново.');
        });
    return () => {
      active = false;
    };
  }, [source?.pages]);
  const request = useMemo(
    () => ({
      sourceId,
      workspaceId: state.activeWorkspaceId,
      startIndex,
      endIndex,
      outputLanguage: language,
    }),
    [sourceId, state.activeWorkspaceId, startIndex, endIndex, language],
  );
  const section = useMemo(() => {
    try {
      return { value: prepareGuideSection(state, request), error: '' };
    } catch (e) {
      return { value: null, error: language.trim() ? errorMessage(e) : 'Укажите язык обзора.' };
    }
  }, [state.sources, state.activeWorkspaceId, request]);
  const hash = fingerprint?.pages === source?.pages ? fingerprint?.hash : undefined;
  const guide = pending?.guide ?? source?.guide;
  const stale = !!guide && !!hash && guide.sourceHash !== hash;
  const cached =
    !!source?.guide && !!hash && guideMatches(source.guide, hash, request, state.settings);
  const busy = phase !== 'idle';
  const close = () => {
    if (phase !== 'saving') {
      epoch.current++;
      onClose();
    }
  };
  async function persist(draft: GuideDraft, token: number) {
    setPhase('saving');
    try {
      await commit((latest) => saveSourceGuide(latest, draft));
      if (token === epoch.current) setPending(null);
    } catch (e) {
      if (token === epoch.current)
        setError(
          `Обзор не сохранён. ${errorMessage(e)} Результат остаётся в этом окне; сохранение можно повторить без вызова модели.`,
        );
    }
  }
  async function generate() {
    if (inFlight.current || !section.value || !hash || cached) return;
    const token = ++epoch.current;
    inFlight.current = true;
    setPhase('generating');
    setError('');
    try {
      const draft = await generateSourceGuide(provider, state, request);
      if (token !== epoch.current) return;
      setPending(draft);
      await persist(draft, token);
    } catch (e) {
      if (token === epoch.current)
        setError(
          e instanceof Error && e.name === 'ZodError'
            ? 'Модель не вернула корректный обзор с подтверждёнными фрагментами. Ничего не сохранено. Попробуйте другой раздел или модель.'
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
    if (inFlight.current || !pending) return;
    const token = ++epoch.current;
    inFlight.current = true;
    setError('');
    try {
      await persist(pending, token);
    } finally {
      if (token === epoch.current) {
        inFlight.current = false;
        setPhase('idle');
      }
    }
  }
  return (
    <Dialog label="Обзор раздела" onClose={close}>
      <section className="modal source-guide">
        <h2>Обзор раздела</h2>
        <p className="muted">
          {source?.title ?? 'Источник недоступен'} · 3 тезиса, 3 термина, 3 вопроса
        </p>
        <p className="small">
          Выберите до 5 страниц и 7 200 символов. Весь выбранный раздел будет передан модели{' '}
          {state.settings.model} ({state.settings.provider}). Обзор создаётся только по кнопке.
        </p>
        <div className="guide-controls">
          <Field label="С начала">
            <select
              aria-label="С начала"
              disabled={busy || !!pending}
              value={startIndex}
              onChange={(e) => {
                const value = Number(e.target.value);
                setStart(value);
                if (endIndex < value) setEnd(value);
              }}
            >
              {source?.pages.map((p, i) => (
                <option key={i} value={i}>
                  {pageLabel(p, i)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="До конца">
            <select
              aria-label="До конца"
              disabled={busy || !!pending}
              value={endIndex}
              onChange={(e) => setEnd(Number(e.target.value))}
            >
              {source?.pages.map((p, i) => (
                <option key={i} value={i}>
                  {pageLabel(p, i)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Язык обзора">
            <input
              maxLength={100}
              disabled={busy || !!pending}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </Field>
        </div>
        {section.value ? (
          <p className="muted small">
            Будут разобраны:{' '}
            {section.value.coveredPages.map((p) => pageLabel(p, p.pageIndex)).join(', ')} ·{' '}
            {section.value.characters.toLocaleString('ru-RU')} символов. Остальные страницы не
            анализируются.
          </p>
        ) : (
          <p role="alert">{section.error}</p>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="button-row">
          {pending ? (
            <>
              <button className="primary" disabled={busy || stale || !hash} onClick={retrySave}>
                Сохранить обзор
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setError('');
                }}
              >
                Отбросить несохранённый обзор
              </button>
            </>
          ) : (
            <button
              className="primary"
              disabled={busy || !section.value || !hash || cached}
              onClick={generate}
            >
              {phase === 'generating'
                ? 'Создаём обзор…'
                : phase === 'saving'
                  ? 'Сохраняем…'
                  : cached
                    ? 'Обзор уже сохранён'
                    : source?.guide
                      ? 'Создать новый обзор'
                      : 'Создать обзор'}
            </button>
          )}
          <button className="secondary" disabled={phase === 'saving'} onClick={close}>
            Закрыть обзор
          </button>
        </div>
        {busy && (
          <p role="status">
            {phase === 'generating'
              ? 'Модель читает выбранный раздел… Окно можно закрыть, результат будет отменён.'
              : 'Сохраняем обзор на этом устройстве…'}
          </p>
        )}
        {!guide && !busy && (
          <p className="muted">
            Обзора пока нет. После создания здесь появятся тезисы, термины и вопросы со ссылками на
            исходный текст.
          </p>
        )}
        {guide && (
          <article className="guide-result" aria-label="Результат обзора">
            <h3>{pending ? 'Обзор ещё не сохранён' : 'Сохранённый обзор'}</h3>
            <p className="small">
              Разобраны только:{' '}
              {guide.coveredPages.map((p) => pageLabel(p, p.pageIndex)).join(', ')} ·{' '}
              {guide.outputLanguage} · {guide.provider} / {guide.model} ·{' '}
              {new Date(guide.createdAt).toLocaleString()}
            </p>
            {!hash ? (
              <p role="status">Проверяем актуальность текста…</p>
            ) : stale ? (
              <p className="notice" role="status">
                Обзор устарел: текст источника изменился. Ниже сохранён предыдущий результат.
                Создайте новый обзор.
              </p>
            ) : (
              !cached &&
              !pending && (
                <p className="muted small">
                  Сохранённый обзор относится к указанным выше страницам и настройкам. Для текущего
                  выбора создайте новый.
                </p>
              )
            )}
            <h3>Главные тезисы</h3>
            <ol>
              {guide.result.points.map((item, i) => (
                <li key={i}>
                  <p>{item.text}</p>
                  <Citations
                    citations={guide.citations.filter((c) => item.citationIds.includes(c.chunkId))}
                  />
                </li>
              ))}
            </ol>
            <h3>Термины</h3>
            <dl>
              {guide.result.terms.map((item, i) => (
                <div key={i}>
                  <dt>{item.term}</dt>
                  <dd>
                    <p>{item.definition}</p>
                    <Citations
                      citations={guide.citations.filter((c) =>
                        item.citationIds.includes(c.chunkId),
                      )}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            <h3>Вопросы для репетитора</h3>
            <p className="muted small">
              Вопрос откроется как редактируемый черновик с нужным фрагментом. Отправьте его, когда
              будете готовы.
            </p>
            <div className="guide-questions">
              {guide.result.questions.map((item, i) => (
                <div key={i}>
                  <SourceTutorButton
                    label={item.text}
                    question={item.text}
                    citation={guide.citations.find((c) => c.chunkId === item.citationIds[0])!}
                    disabled={stale || !hash}
                    onSelect={close}
                  />
                  <Citations
                    citations={guide.citations.filter((c) => item.citationIds.includes(c.chunkId))}
                  />
                </div>
              ))}
            </div>
          </article>
        )}
      </section>
    </Dialog>
  );
}
