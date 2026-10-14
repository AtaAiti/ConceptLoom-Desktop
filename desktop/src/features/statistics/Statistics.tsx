import { PageHeading, Panel, Progress } from '../../components/ui';
import { statistics, dayKey } from '../../learning/planner';
import { masteryLabel, topicMastery } from '../../learning/mastery';
import type { Workspace } from '../../types/state';

export function Statistics({ state, weakOnly = false }: { state: Workspace; weakOnly?: boolean }) {
  const stats = statistics(state);
  const weak = state.topics
    .map((t) => ({
      topic: t,
      errors: state.attempts.filter((a) => a.topicId === t.id && !a.accurate).length,
      score: topicMastery(state, t.id),
    }))
    .filter((t) => t.errors > 0)
    .sort((a, b) => b.errors - a.errors);
  const calendar = Array.from({ length: 84 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 83 + i);
    const key = dayKey(date);
    const count =
      state.attempts.filter((a) => dayKey(a.createdAt) === key).length +
      state.reviews.filter((r) => dayKey(r.createdAt) === key).length;
    return { key, count };
  });
  return (
    <>
      <PageHeading
        eyebrow="EVIDENCE / YOUR PROGRESS"
        title={weakOnly ? 'Turn mistakes into connections.' : 'See your understanding grow.'}
        description="Real evidence from practice and retrieval. Opening a lesson never earns mastery."
      />
      {!weakOnly && (
        <>
          <div className="metrics">
            {[
              { label: 'Practice time', value: `${stats.minutes} min` },
              { label: 'Lessons completed', value: stats.lessonsCompleted },
              { label: 'Cards reviewed', value: state.reviews.length },
              { label: 'Current streak', value: `${stats.streak} days` },
            ].map((item) => (
              <div className="metric" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <Panel title="Activity calendar" subtitle="LAST 12 WEEKS">
            <div className="activity-calendar">
              {calendar.map((day) => (
                <div
                  key={day.key}
                  className={`calendar-day level-${Math.min(3, day.count)}`}
                  title={`${day.key}: ${day.count} attempts`}
                />
              ))}
            </div>
            <p className="muted small">
              Each square is a day. Brighter squares reflect more practice and review attempts.
            </p>
          </Panel>
          <Panel title="Concept evidence">
            {state.topics.map((topic) => {
              const score = topicMastery(state, topic.id);
              return (
                <div className="concept-stat" key={topic.id}>
                  <div>
                    <strong>{topic.title}</strong>
                    <span>
                      {masteryLabel(score)} · {score}%
                    </span>
                  </div>
                  <Progress value={score} />
                </div>
              );
            })}
            {!state.topics.length && (
              <p className="muted">Create a course to begin collecting evidence.</p>
            )}
          </Panel>
        </>
      )}
      <Panel title="Weak areas" subtitle={`${weak.length} connections to revisit`}>
        {weak.map((item) => (
          <div className="weak-row" key={item.topic.id}>
            <div>
              <h3>{item.topic.title}</h3>
              <p className="muted">
                {
                  state.attempts.filter((a) => a.topicId === item.topic.id && !a.accurate).at(-1)
                    ?.feedback
                }
              </p>
            </div>
            <span className="status-pill">{item.errors} gaps / errors</span>
          </div>
        ))}
        {!weak.length && (
          <p className="muted">
            No recorded gaps or mistakes. Your tutor will use these patterns as evidence
            accumulates.
          </p>
        )}
      </Panel>
    </>
  );
}
