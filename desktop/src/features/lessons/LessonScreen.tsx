import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { PageHeading, Panel, Empty, Progress } from '../../components/ui';
import { gradeExact, publicExercise, topicStatus, prepareLesson } from '../../learning/conceptloom';
import { masteryLabel, topicMastery } from '../../learning/mastery';
import { lessonContentSchema, verdictSchema } from '../../ai/schemas';
import { systemPrompt } from '../../ai/prompts/system';
import { lessonPrompt } from '../../ai/prompts/lesson';
import { generateGrounded } from '../../ai/sourceLearning';
import { SourceContext, Citations } from '../library/SourceContext';
import { quizPrompt } from '../../ai/prompts/quiz';
import { newCard } from '../../learning/reviews';
import type { AIProvider } from '../../ai/providers/ollama';
import type { Commit } from '../../hooks/useWorkspace';
import type { Attempt, Course, Exercise, Topic, Workspace } from '../../types/state';

export function LessonScreen({
  state,
  course,
  topic,
  commit,
  provider,
  run,
  select,
}: {
  state: Workspace;
  course?: Course;
  topic?: Topic;
  commit: Commit;
  provider: AIProvider;
  run: (task: () => Promise<void>) => void;
  select: (topic: Topic) => void;
}) {
  const [working, setWorking] = useState(false);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [confidence, setConfidence] = useState(50);
  const [feedback, setFeedback] = useState<Attempt | null>(null);
  const started = useRef(Date.now());
  useEffect(() => {
    const saved = state.sessions.find((s) => s.topicId === topic?.id);
    const restored = state.lessons.find((l) => l.topicId === topic?.id);
    const resumeIndex =
      restored?.content.exercises.findIndex((e) => e.id === saved?.exerciseId) ?? 0;
    setIndex(Math.max(0, resumeIndex));
    setResponse(saved?.pendingResponse === '__gap__' ? '' : (saved?.pendingResponse ?? ''));
    setFeedback(null);
    started.current = Date.now();
  }, [topic?.id]);
  if (!course || !topic)
    return (
      <Empty
        title="Найдите следующую связь"
        description="Выберите доступное понятие на карте знаний."
      />
    );
  if (topicStatus(state, topic) === 'locked')
    return (
      <Empty
        title="Начните с предпосылок"
        description="Подтвердите понимание предыдущих связей, чтобы открыть это понятие."
      />
    );
  const lesson = state.lessons.find((l) => l.topicId === topic.id);
  const located = state.attempts.some((a) => a.topicId === topic.id);
  const score = topicMastery(state, topic.id);
  const next = state.topics.find(
    (t) =>
      t.courseId === course.id &&
      t.id !== topic.id &&
      t.dependsOn.includes(topic.id) &&
      topicStatus(state, t) !== 'locked',
  );
  const exercise = lesson?.content.exercises[index];
  async function assess(question: Exercise, gap = false) {
    if (!course || !topic) return;
    setWorking(true);
    try {
      const elapsedSeconds = Math.min(1800, Math.round((Date.now() - started.current) / 1000));
      const answer = gap ? '__gap__' : response.trim();
      // Save the exact learner response/resume point before AI grading or continuation.
      await commit((s) => ({
        ...s,
        sessions: [
          ...s.sessions.filter((v) => v.id !== topic.id),
          {
            id: topic.id,
            courseId: course.id,
            topicId: topic.id,
            phase: 'build',
            nextStep: `Assess ${question.id}: ${answer}`,
            exerciseId: question.id,
            pendingResponse: answer,
            updatedAt: new Date().toISOString(),
          },
        ],
      }));
      const exact = gap ? false : gradeExact(question, answer);
      const verdict =
        exact === null
          ? await provider.structured(
              [
                { role: 'system', content: systemPrompt(course) },
                { role: 'user', content: quizPrompt(question, answer) },
              ],
              verdictSchema,
            )
          : {
              accurate: exact,
              feedback: gap
                ? `A knowledge gap is useful evidence. ${question.rationale}`
                : question.rationale,
            };
      const attempt: Attempt = {
        id: crypto.randomUUID(),
        courseId: course.id,
        topicId: topic.id,
        exerciseId: question.id,
        response: answer,
        dimension: question.dimension,
        accurate: verdict.accurate,
        gap,
        hintUsed: false,
        confidence,
        feedback: verdict.feedback,
        createdAt: new Date().toISOString(),
        elapsedSeconds,
      };
      await commit((s) => ({
        ...s,
        attempts: [...s.attempts, attempt],
        sessions: s.sessions.map((v) =>
          v.id === topic.id
            ? {
                ...v,
                phase: verdict.accurate && question.dimension === 'transfer' ? 'transfer' : 'build',
                nextStep: verdict.accurate
                  ? `Retrieve the next connection after ${question.id}`
                  : `Repair ${topic.title} and retry ${question.id}`,
                exerciseId: verdict.accurate
                  ? lesson?.content.exercises[(index + 1) % lesson.content.exercises.length].id
                  : question.id,
                pendingResponse: undefined,
                updatedAt: new Date().toISOString(),
              }
            : v,
        ),
      }));
      setFeedback(attempt);
      started.current = Date.now();
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={`${located ? 'BUILD' : 'LOCATE'} / ${course.name.toUpperCase()}`}
        title={topic.title}
        description="Одна связь. Понятное объяснение. Проверка понимания."
        action={
          <span className="status-pill">
            {masteryLabel(score)} · {score}%
          </span>
        }
      />
      {!lesson && <SourceContext state={state} course={course} commit={commit} run={run} />}
      {lesson && <Citations citations={lesson.citations} />}
      {!lesson ? (
        <Panel>
          <Empty
            title="Разберём это понятие"
            description="Выбранная модель ИИ подготовит объяснение и задания. Прогресс меняют ваши ответы."
          >
            <button
              className="primary"
              disabled={working}
              onClick={() =>
                run(async () => {
                  setWorking(true);
                  try {
                    const { result: generated, citations } = await generateGrounded(
                      provider,
                      state,
                      course,
                      `${topic.title} ${topic.description}`,
                      lessonPrompt(topic, state),
                      lessonContentSchema,
                    );
                    const content = prepareLesson(generated);
                    const now = new Date().toISOString();
                    await commit((s) => {
                      if (s.lessons.some((l) => l.topicId === topic.id)) return s;
                      return {
                        ...s,
                        lessons: [
                          ...s.lessons,
                          {
                            id: crypto.randomUUID(),
                            courseId: course.id,
                            topicId: topic.id,
                            content,
                            citations,
                            createdAt: now,
                          },
                        ],
                        cards: [
                          ...s.cards,
                          ...content.flashcards.map((c) => ({
                            ...newCard(course.id, topic.id, c.front, c.back),
                            citations,
                            createdBy: 'ai' as const,
                            blocks: [
                              { type: 'text' as const, text: c.back },
                              { type: 'example' as const, text: content.examples[0] },
                            ],
                          })),
                        ],
                        sessions: [
                          ...s.sessions.filter((v) => v.id !== topic.id),
                          {
                            id: topic.id,
                            courseId: course.id,
                            topicId: topic.id,
                            phase: 'build',
                            nextStep: `Practice ${content.exercises[0].id}`,
                            updatedAt: now,
                          },
                        ],
                      };
                    });
                    started.current = Date.now();
                  } finally {
                    setWorking(false);
                  }
                })
              }
            >
              <Sparkles size={16} />
              {working ? 'Готовим занятие…' : 'Подготовить занятие'}
            </button>
          </Empty>
        </Panel>
      ) : (
        <div className="lesson-layout">
          <div>
            {!located && (
              <Panel title="Найдите границу знаний">
                <p className="muted">
                  Try the first checkpoint before reading the explanation. You can choose “I don’t
                  know yet”. We use that response to find where to begin.
                </p>
              </Panel>
            )}
            {located && (
              <>
                <Panel title="Понятие" subtitle="01 / UNDERSTAND">
                  <h2 className="concept-title">{lesson.content.concept}</h2>
                  <p className="prose">{lesson.content.explanation}</p>
                </Panel>
                <Panel title="Связь с предыдущими знаниями" subtitle="02 / CONNECT">
                  <p className="prose connection-copy">{lesson.content.connection}</p>
                </Panel>
                <Panel title="Примеры применения" subtitle="03 / EXAMPLES">
                  <div className="examples">
                    {lesson.content.examples.map((example, i) => (
                      <div key={i}>
                        <span>0{i + 1}</span>
                        <p className="prose">{example}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </>
            )}
            <Panel
              title="Проверка знаний"
              subtitle={`04 / ${exercise?.dimension.toUpperCase() ?? 'RETRIEVE'}`}
            >
              <div className="exercise-tabs">
                {lesson.content.exercises.map((q, i) => (
                  <button
                    key={q.id}
                    disabled={working}
                    className={index === i ? 'selected' : ''}
                    onClick={() => {
                      setIndex(i);
                      setResponse('');
                      setFeedback(null);
                      started.current = Date.now();
                    }}
                  >
                    {i + 1}
                    {state.attempts.some(
                      (a) => a.topicId === topic.id && a.exerciseId === q.id && a.accurate,
                    ) && <CheckCircle2 size={12} />}
                  </button>
                ))}
              </div>
              {exercise &&
                (() => {
                  const question = publicExercise(exercise);
                  return (
                    <>
                      <span className="eyebrow">{question.type.replaceAll('-', ' ')}</span>
                      <h3 className="question">{question.prompt}</h3>
                      {question.options.length ? (
                        <div className="answer-options">
                          {question.options.map((option, i) => (
                            <button
                              key={i}
                              disabled={working || !!feedback}
                              className={response === option ? 'selected' : ''}
                              onClick={() => setResponse(option)}
                            >
                              <span>{String.fromCharCode(65 + i)}</span>
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          aria-label="Your answer"
                          placeholder={
                            question.type === 'build-sentence'
                              ? 'Arrange the words and write your sentence…'
                              : 'Объясните своими словами…'
                          }
                          value={response}
                          disabled={working || !!feedback}
                          onChange={(e) => setResponse(e.target.value)}
                        />
                      )}
                      {!feedback && (
                        <>
                          <label className="confidence">
                            Confidence{' '}
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={confidence}
                              onChange={(e) => setConfidence(Number(e.target.value))}
                            />
                            <span>{confidence}%</span>
                          </label>
                          <div className="button-row">
                            <button
                              className="primary"
                              disabled={working || !response.trim()}
                              onClick={() => run(() => assess(exercise))}
                            >
                              {working ? 'Проверяем и сохраняем…' : 'Проверить понимание'}
                            </button>
                            <button
                              className="text-button"
                              disabled={working}
                              onClick={() => run(() => assess(exercise, true))}
                            >
                              Пока не знаю
                            </button>
                          </div>
                        </>
                      )}
                      {feedback && (
                        <div className={`feedback ${feedback.accurate ? 'accurate' : 'repair'}`}>
                          <strong>
                            {feedback.accurate
                              ? 'Понимание подтверждено.'
                              : feedback.gap
                                ? 'Нашли точку старта.'
                                : 'Разберём эту связь ещё раз.'}
                          </strong>
                          <p className="prose">{feedback.feedback}</p>
                          {!feedback.accurate && confidence >= 75 && (
                            <p>
                              High-confidence error: compare your explanation with a counterexample
                              before retrying.
                            </p>
                          )}
                          <button
                            className="secondary"
                            onClick={() => {
                              setFeedback(null);
                              setResponse('');
                              if (feedback.accurate)
                                setIndex((index + 1) % lesson.content.exercises.length);
                              started.current = Date.now();
                            }}
                          >
                            {feedback.accurate ? 'Следующее задание' : 'Попробовать ещё'}
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
            </Panel>
            {located && (
              <Panel title="Главное" subtitle="05 / SUMMARY">
                <p className="prose">{lesson.content.summary}</p>
              </Panel>
            )}
          </div>
          <aside>
            <Panel title="Ваши результаты">
              <strong className="big-number">{score}%</strong>
              <Progress value={score} />
              <p className="muted">
                {masteryLabel(score)} · Earned through checkpoints and reviews.
              </p>
              {['recognition', 'recall', 'application', 'transfer'].map((d) => (
                <div className="evidence-row" key={d}>
                  <span>{d}</span>
                  <span>
                    {state.attempts.some(
                      (a) => a.topicId === topic.id && a.dimension === d && a.accurate,
                    )
                      ? 'Demonstrated'
                      : 'To explore'}
                  </span>
                </div>
              ))}
            </Panel>
            <Panel title="Карточки для повторения">
              <p className="muted">Retrieve before revealing the answer in Reviews.</p>
              {state.cards
                .filter((c) => c.topicId === topic.id)
                .map((c) => (
                  <div className="card-preview" key={c.id}>
                    {c.front}
                  </div>
                ))}
            </Panel>
            <Panel title="Ошибки для разбора">
              {state.attempts
                .filter((a) => a.topicId === topic.id && !a.accurate)
                .slice(-3)
                .map((a) => (
                  <p className="small" key={a.id}>
                    {a.feedback}
                  </p>
                ))}
              {!state.attempts.some((a) => a.topicId === topic.id && !a.accurate) && (
                <p className="muted">Пока нет записанных ошибок.</p>
              )}
            </Panel>
            {next && (
              <button className="primary full" onClick={() => select(next)}>
                Next concept <ArrowRight size={16} />
              </button>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
