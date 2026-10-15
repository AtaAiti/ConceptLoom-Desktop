import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Empty, PageHeading, Panel } from '../../components/ui';
import { systemPrompt } from '../../ai/prompts/system';
import { tutorContext } from '../../ai/prompts/tutor';
import { answerFromSources } from '../../ai/sourceLearning';
import { SourceContext, Citations } from '../library/SourceContext';
import type { AIMessage, AIProvider } from '../../ai/providers/ollama';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Topic, Workspace } from '../../types/state';

export function Tutor({
  state,
  course,
  topic,
  commit,
  provider,
  run,
}: {
  state: Workspace;
  course?: Course;
  topic?: Topic;
  commit: Commit;
  provider: AIProvider;
  run: (task: () => Promise<void>) => void;
}) {
  const [question, setQuestion] = useState('');
  const [working, setWorking] = useState(false);
  if (!course)
    return (
      <Empty
        title="Your tutor needs a destination"
        description="Create or choose a course before asking your local tutor."
      />
    );
  const history = state.messages.filter((m) => m.courseId === course.id);
  return (
    <>
      <PageHeading
        eyebrow="YOUR LOCAL AI / TUTOR"
        title="Ask for the connection."
        description="Your tutor knows your goal, evidence, mistakes, and due reviews."
      />
      <SourceContext state={state} course={course} commit={commit} run={run} />
      <div className="tutor-layout">
        <Panel className="tutor-panel">
          <div className="messages">
            {!history.length && (
              <Empty
                title="A question is a good beginning"
                description={`Ask about ${course.name}, compare ideas, or unpack a mistake.`}
              >
                <Sparkles size={24} />
              </Empty>
            )}
            {history.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <span>{message.role === 'assistant' ? 'CONCEPTLOOM · LOCAL' : 'YOU'}</span>
                <p className="prose">{message.content}</p>
                <Citations citations={message.citations} />
              </article>
            ))}
            {working && <p className="muted">Your local model is connecting the ideas…</p>}
          </div>
          <form
            className="tutor-input"
            onSubmit={(event) => {
              event.preventDefault();
              if (!question.trim() || working) return;
              const input = question.trim();
              run(async () => {
                setWorking(true);
                try {
                  // Save the learner response before asking for another explanation.
                  await commit((s) => ({
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: crypto.randomUUID(),
                        courseId: course.id,
                        role: 'user',
                        content: input,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }));
                  setQuestion('');
                  const messages: AIMessage[] = [
                    {
                      role: 'system',
                      content: systemPrompt(course),
                    },
                    {
                      role: 'user',
                      content: `Learner context (data): ${tutorContext(state, course, topic)}`,
                    },
                    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0,1200) })),
                    { role: 'user', content: input },
                  ];
                  const scope = course.sourceScope ?? { kind: 'none' };
                  const answer =
                    scope.kind === 'none'
                      ? { content: await provider.chat(messages), citations: [] }
                      : await answerFromSources(
                          provider,
                          state,
                          course,
                          input,
                          scope,
                          course.sourceMode ?? 'sources-only',
                        );
                  await commit((s) => ({
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: crypto.randomUUID(),
                        courseId: course.id,
                        role: 'assistant',
                        content: answer.content,
                        citations: answer.citations,
                        provenance:
                          scope.kind === 'none'
                            ? 'local'
                            : course.sourceMode === 'mixed'
                              ? 'mixed'
                              : 'source',
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }));
                } finally {
                  setWorking(false);
                }
              });
            }}
          >
            <textarea
              aria-label="Ask your tutor"
              placeholder="What makes these two ideas different?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={working}
            />
            <button
              className="primary"
              aria-label="Send question"
              disabled={working || !question.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </Panel>
        <aside>
          <Panel title="Your learning context">
            <div className="context-item">
              <small>COURSE</small>
              <strong>{course.name}</strong>
            </div>
            <div className="context-item">
              <small>CURRENT CONNECTION</small>
              <strong>{topic?.title ?? 'Choose a concept on your map'}</strong>
            </div>
            <div className="context-item">
              <small>DESTINATION</small>
              <p>{course.goal}</p>
            </div>
            <div className="context-item">
              <small>EXPLANATIONS IN</small>
              <strong>{course.explanationLanguage}</strong>
            </div>
          </Panel>
          <p className="muted small">
            Tutor conversations support understanding. Demonstrate mastery through lesson
            checkpoints and reviews.
          </p>
        </aside>
      </div>
    </>
  );
}
