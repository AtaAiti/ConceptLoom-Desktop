import { useMemo, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Empty, PageHeading, Panel, errorMessage } from '../../components/ui';
import { systemPrompt } from '../../ai/prompts/system';
import { tutorContext } from '../../ai/prompts/tutor';
import { answerFromSources } from '../../ai/sourceLearning';
import { SourceContext, Citations } from '../library/SourceContext';
import type { AIMessage, AIProvider } from '../../ai/providers/ollama';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Topic, Workspace } from '../../types/state';
import { resolvePinnedSource } from '../library/sourceIndex';
import type { TutorDraft } from './draft';
import { SaveExplanationButton } from './SaveExplanationButton';

export function Tutor({
  state,
  course,
  topic,
  commit,
  provider,
  run,
  draft,
  updateDraft,
  readSource,
  working,
  setWorking,
}: {
  state: Workspace;
  course?: Course;
  topic?: Topic;
  commit: Commit;
  provider: AIProvider;
  run: (task: () => Promise<void>) => void;
  draft: TutorDraft;
  updateDraft: (next: TutorDraft) => void;
  readSource: () => void;
  working: boolean;
  setWorking: (value: boolean) => void;
}) {
  const inFlight = useRef(false);
  const [requestError, setRequestError] = useState('');
  const pinnedError = useMemo(() => {
    if (!draft.pinned) return '';
    try {
      resolvePinnedSource(state, draft.pinned);
      return '';
    } catch (e) {
      return errorMessage(e);
    }
  }, [state.sources, state.activeWorkspaceId, draft.pinned]);
  if (!course)
    return (
      <Empty
        title="Репетитору нужна цель"
        description="Создайте или выберите учебное направление."
      />
    );
  const history = state.messages.filter((m) => m.courseId === course.id);
  async function send() {
    if (!course || !draft.question.trim() || working || inFlight.current) return;
    const input = draft.question.trim();
    const pinned = draft.pinned;
    inFlight.current = true;
    setWorking(true);
    setRequestError('');
    try {
      if (pinned) resolvePinnedSource(state, pinned);
      const pending = history.find(
        (m) =>
          m.id === draft.retryMessageId &&
          m.role === 'user' &&
          m.content === input &&
          JSON.stringify(m.pinnedSource) === JSON.stringify(pinned),
      );
      const messageId = pending?.id ?? crypto.randomUUID();
      await commit((s) =>
        s.messages.some((m) => m.id === messageId)
          ? s
          : {
              ...s,
              messages: [
                ...s.messages,
                {
                  id: messageId,
                  courseId: course.id,
                  role: 'user',
                  content: input,
                  pinnedSource: pinned,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
      );
      // Keep the draft until the answer is durably saved. Retry reuses this user message.
      updateDraft({ ...draft, retryMessageId: messageId });
      const prior = history.filter((m) => m.id !== messageId);
      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt(course) },
        { role: 'user', content: `Learner context (data): ${tutorContext(state, course, topic)}` },
        ...prior.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1200) })),
        { role: 'user', content: input },
      ];
      const scope = pinned
        ? { kind: 'selected' as const, sourceIds: [pinned.sourceId] }
        : (course.sourceScope ?? { kind: 'none' as const });
      const answer =
        scope.kind === 'none'
          ? { content: await provider.chat(messages), citations: [] }
          : await answerFromSources(
              provider,
              { ...state, messages: prior },
              course,
              input,
              scope,
              pinned ? 'sources-only' : (course.sourceMode ?? 'sources-only'),
              pinned,
            );
      await commit((s) =>
        s.messages.some((m) => m.replyTo === messageId)
          ? s
          : {
              ...s,
              messages: [
                ...s.messages,
                {
                  id: crypto.randomUUID(),
                  courseId: course.id,
                  role: 'assistant',
                  content: answer.content,
                  replyTo: messageId,
                  pinnedSource: pinned,
                  citations: answer.citations,
                  provenance:
                    scope.kind === 'none'
                      ? 'local'
                      : !pinned && course.sourceMode === 'mixed'
                        ? 'mixed'
                        : 'source',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
      );
      updateDraft({ id: crypto.randomUUID(), question: '', pinned });
    } catch (e) {
      setRequestError(errorMessage(e));
      throw e;
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ВАШ ИИ / РЕПЕТИТОР"
        title={topic?.title ?? 'Репетитор'}
        description="Репетитор · одна связь за раз · объяснение с опорой на ваши материалы"
      />
      {draft.pinned ? (
        <section className="pinned-context" aria-label="Выбранный фрагмент">
          <div className="section-line">
            <strong>
              {draft.pinned.title}
              {draft.pinned.page ? ` · с. ${draft.pinned.page}` : ' · фрагмент'}
            </strong>
            <button
              className="text-button"
              disabled={working}
              onClick={() => {
                setRequestError('');
                updateDraft({ id: crypto.randomUUID(), question: draft.question });
              }}
            >
              Убрать фрагмент
            </button>
          </div>
          <p className="muted small">
            Ответ только по этому фрагменту. Настройки источников направления не меняются.
          </p>
          <p className="prose handoff-excerpt">{draft.pinned.excerpt}</p>
          <button className="text-button" disabled={!!pinnedError} onClick={readSource}>
            Вернуться к источнику
          </button>
          {pinnedError && <p role="alert">{pinnedError}</p>}
        </section>
      ) : (
        <SourceContext state={state} course={course} commit={commit} run={run} />
      )}
      <div className="tutor-layout">
        <Panel className="tutor-panel">
          <div className="messages">
            {!history.length && (
              <Empty
                title="Вопрос — хорошее начало"
                description={`Задайте вопрос по теме «${course.name}», сравните идеи или разберите ошибку.`}
              >
                <Sparkles size={24} />
              </Empty>
            )}
            {history.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <span>{message.role === 'assistant' ? 'CONCEPTLOOM' : 'YOU'}</span>
                <p className="prose">{message.content}</p>
                <Citations citations={message.citations} />
                {message.role === 'assistant' && (
                  <SaveExplanationButton
                    message={message}
                    workspaceId={state.activeWorkspaceId}
                    commit={commit}
                  />
                )}
                {message.role === 'user' &&
                  message.pinnedSource &&
                  !history.some((m) => m.replyTo === message.id) && (
                    <button
                      className="text-button"
                      disabled={working}
                      onClick={() => {
                        setRequestError('');
                        updateDraft({
                          id: crypto.randomUUID(),
                          question: message.content,
                          pinned: message.pinnedSource,
                          retryMessageId: message.id,
                        });
                      }}
                    >
                      Вернуть вопрос без ответа
                    </button>
                  )}
              </article>
            ))}
            {working && <p className="muted">ИИ ищет связь…</p>}
            {requestError && (
              <p role="alert">
                {requestError} Вопрос сохранён в поле ниже — можно повторить запрос.
              </p>
            )}
          </div>
          <form
            className="tutor-input"
            onSubmit={(event) => {
              event.preventDefault();
              run(send);
            }}
          >
            <textarea
              aria-label="Ask your tutor"
              placeholder="Объясните следующий шаг своими словами…"
              value={draft.question}
              maxLength={20000}
              onChange={(e) => updateDraft({ ...draft, question: e.target.value })}
              disabled={working}
            />
            <button
              className="primary"
              aria-label="Send question"
              disabled={working || !!pinnedError || !draft.question.trim()}
            >
              <Send size={18} /> {draft.retryMessageId ? 'Повторить запрос' : 'Отправить'}
            </button>
          </form>
        </Panel>
        <aside>
          <Panel title="Опора в источнике">
            <Citations
              citations={
                [...history].reverse().find((m) => m.citations?.length)?.citations ??
                topic?.citations
              }
            />
            <div className="context-item">
              <small>НАПРАВЛЕНИЕ</small>
              <strong>{course.name}</strong>
            </div>
            <div className="context-item">
              <small>ТЕКУЩАЯ СВЯЗЬ</small>
              <strong>{topic?.title ?? 'Выберите понятие на карте'}</strong>
            </div>
            <div className="context-item">
              <small>ЦЕЛЬ</small>
              <p>{course.goal}</p>
            </div>
            <div className="context-item">
              <small>ЯЗЫК ОБЪЯСНЕНИЙ</small>
              <strong>{course.explanationLanguage}</strong>
            </div>
          </Panel>
          <Panel title="Веб выключен">
            <p className="muted small">
              {state.settings.provider === 'ollama'
                ? 'Работает локальная модель.'
                : 'Учебный контекст отправляется выбранному ИИ через ваш аккаунт.'}{' '}
              Проверяйте объяснения по указанным фрагментам источников.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
