import { PageHeading, Panel, Empty, Progress } from '../../components/ui';
import { topicStatus } from '../../learning/conceptloom';
import { topicMastery } from '../../learning/mastery';
import { Citations } from '../library/SourceContext';
import type { Course, Topic, Workspace } from '../../types/state';

export function Roadmap({
  state,
  course,
  learn,
  edit,
}: {
  state: Workspace;
  course?: Course;
  learn: (topic: Topic) => void;
  edit: () => void;
}) {
  if (!course)
    return (
      <Empty title="Choose a destination" description="Create a study path to build a roadmap." />
    );
  const remaining = state.topics.filter((t) => t.courseId === course.id);
  const ordered: Topic[] = [];
  while (remaining.length) {
    const index = remaining.findIndex((t) =>
      t.dependsOn.every((id) => ordered.some((p) => p.id === id)),
    );
    if (index < 0) break;
    ordered.push(...remaining.splice(index, 1));
  }
  return (
    <>
      <PageHeading
        eyebrow="ROADMAP / NEXT CONNECTION"
        title={course.name}
        description={course.goal}
        action={
          <button className="secondary" onClick={edit}>
            Edit knowledge map
          </button>
        }
      />
      {!ordered.length && (
        <Empty
          title="Build a short, useful route"
          description="Add concepts or ask the local model for a proposal using your selected sources."
        >
          <button className="primary" onClick={edit}>
            Plan route
          </button>
        </Empty>
      )}
      <div className="roadmap-list">
        {ordered.map((topic, index) => (
          <Panel key={topic.id} title={`${index + 1}. ${topic.title}`}>
            <p>{topic.description}</p>
            <Progress value={topicMastery(state, topic.id)} />
            <p className="muted small">
              {topicStatus(state, topic)} · {topicMastery(state, topic.id)}% demonstrated mastery ·{' '}
              {topic.dependsOn.length
                ? `After: ${topic.dependsOn.map((id) => ordered.find((t) => t.id === id)?.title).join(', ')}`
                : 'Locate your starting point'}
            </p>
            <Citations citations={topic.citations} />
            <button
              className="primary compact"
              disabled={topicStatus(state, topic) === 'locked'}
              onClick={() => learn(topic)}
            >
              {state.lessons.some((l) => l.topicId === topic.id)
                ? 'Continue practice'
                : 'Open lesson'}
            </button>
          </Panel>
        ))}
      </div>
    </>
  );
}
