import { PageHeading, Panel } from '../../components/ui';
import { todayPlan, dayKey } from '../../learning/planner';
import type { Workspace, Topic } from '../../types/state';

export function Today({
  state,
  learn,
  navigate,
}: {
  state: Workspace;
  learn: (topic: Topic) => void;
  navigate: (page: string) => void;
}) {
  const due = state.cards.filter((c) => new Date(c.due) <= new Date());
  const today = dayKey(new Date());
  const reviews = state.reviews.filter((r) => dayKey(r.createdAt) === today).length;
  const minutes = Math.round(
    state.attempts
      .filter((a) => dayKey(a.createdAt) === today)
      .reduce((sum, a) => sum + a.elapsedSeconds, 0) / 60,
  );
  const resume = [...state.sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((s) => s.phase !== 'complete');
  const resumeTopic = state.topics.find((t) => t.id === resume?.topicId);
  const weak = [...state.attempts].reverse().find((a) => !a.accurate);
  const weakTopic = state.topics.find((t) => t.id === weak?.topicId);
  return (
    <>
      <PageHeading
        eyebrow="TODAY / ONE USEFUL STEP"
        title="Your next study session."
        description={`${minutes} / ${state.settings.dailyMinutes} practice minutes · ${reviews} / ${state.settings.dailyReviews} reviews today`}
      />
      <div className="flashcard-grid">
        <Panel title="Retrieve">
          <p>{due.length} cards ready for spaced recall.</p>
          <button className="primary" disabled={!due.length} onClick={() => navigate('Reviews')}>
            Start reviews
          </button>
        </Panel>
        {resumeTopic && (
          <Panel title="Continue where you stopped">
            <p>{resumeTopic.title}</p>
            <button className="primary" onClick={() => learn(resumeTopic)}>
              Resume lesson
            </button>
          </Panel>
        )}
        {weakTopic && (
          <Panel title="Repair a connection">
            <p>{weakTopic.title}</p>
            <p className="muted small">A previous mistake is a useful place to check again.</p>
            <button className="secondary" onClick={() => learn(weakTopic)}>
              Practice weak area
            </button>
          </Panel>
        )}
        {todayPlan(state)
          .slice(0, 3)
          .map(({ course, topic }) => (
            <Panel key={topic.id} title={topic.title}>
              <p className="muted">{course.name}</p>
              <button className="primary" onClick={() => learn(topic)}>
                Learn next connection
              </button>
            </Panel>
          ))}
      </div>
      {!state.courses.length && (
        <Panel title="Start with a goal">
          <p>Add your materials and create a study path for any subject.</p>
          <div className="button-row">
            <button className="primary" onClick={() => navigate('Library')}>
              Add sources
            </button>
            <button className="secondary" onClick={() => navigate('Courses')}>
              Create study path
            </button>
          </div>
        </Panel>
      )}
    </>
  );
}
