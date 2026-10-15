import { useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Sparkles } from 'lucide-react';
import { Empty, Field, Panel, PageHeading } from '../../components/ui';
import { topicStatus, validateMap } from '../../learning/conceptloom';
import { topicMastery } from '../../learning/mastery';
import { mapSchema } from '../../ai/schemas';
import { generateGrounded } from '../../ai/sourceLearning';
import { SourceContext, Citations } from '../library/SourceContext';
import { knowledgeMapPrompt } from '../../ai/prompts/knowledgeMap';
import type { AIProvider } from '../../ai/providers/ollama';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Topic, Workspace } from '../../types/state';

export function KnowledgeMap({
  state,
  course,
  commit,
  provider,
  learn,
  run,
}: {
  state: Workspace;
  course?: Course;
  commit: Commit;
  provider: AIProvider;
  learn: (topic: Topic) => void;
  run: (task: () => Promise<void>) => void;
}) {
  const [edit, setEdit] = useState<Topic | null>(null);
  const [proposal, setProposal] = useState<Topic[]>([]);
  const [working, setWorking] = useState(false);
  if (!course)
    return (
      <Empty
        title="A map needs a destination"
        description="Create a course to map your learning path."
      />
    );
  const topics = state.topics.filter((t) => t.courseId === course.id);
  function depth(topic: Topic): number {
    return topic.dependsOn.length
      ? 1 + Math.max(...topic.dependsOn.map((id) => depth(topics.find((t) => t.id === id)!)))
      : 0;
  }
  const rows = new Map<number, number>();
  const nodes = topics.map((topic) => {
    const level = depth(topic);
    const column = rows.get(level) ?? 0;
    rows.set(level, column + 1);
    const status = topicStatus(state, topic);
    return {
      id: topic.id,
      position: topic.position ?? { x: column * 250 + 80, y: level * 110 + 30 },
      data: {
        label: (
          <>
            <strong>{topic.title}</strong>
            <span>
              {status} · {topicMastery(state, topic.id)}% mastery
            </span>
          </>
        ),
      },
      className: `concept-node ${status}`,
    };
  });
  const edges = topics.flatMap((t) =>
    t.dependsOn.map((id) => ({
      id: `${id}-${t.id}`,
      source: id,
      target: t.id,
      animated: topicStatus(state, t) === 'available',
    })),
  );
  const onClick: NodeMouseHandler = (_event, node) => {
    const topic = topics.find((t) => t.id === node.id);
    if (topic) setEdit({ ...topic });
  };
  const connect = (connection: Connection) =>
    run(async () => {
      if (!connection.source || !connection.target) return;
      await commit((s) => {
        const next = s.topics.map((t) =>
          t.id === connection.target
            ? { ...t, dependsOn: [...new Set([...t.dependsOn, connection.source!])] }
            : t,
        );
        validateMap(next);
        return { ...s, topics: next };
      });
    });
  return (
    <>
      <PageHeading
        eyebrow="WEAVE / CONNECTED KNOWLEDGE"
        title="See how it all connects."
        description={`${course.name} · A path from your frontier to your goal.`}
        action={
          <div className="button-row">
            <button
              className="secondary"
              disabled={working}
              onClick={() =>
                run(async () => {
                  setWorking(true);
                  try {
                    const { result, citations } = await generateGrounded(
                      provider,
                      state,
                      course,
                      `${course.name} ${course.goal}`,
                      knowledgeMapPrompt,
                      mapSchema,
                      true,
                    );
                    const ids = new Map(result.topics.map((t) => [t.key, crypto.randomUUID()]));
                    if (ids.size !== result.topics.length)
                      throw new Error('The AI map has duplicate keys. Please retry.');
                    const suggested = result.topics.map((t) => ({
                      id: ids.get(t.key)!,
                      courseId: course.id,
                      title: t.title,
                      description: t.description,
                      dependsOn: t.dependsOn.map((key) => {
                        const id = ids.get(key);
                        if (!id)
                          throw new Error('The AI map has a missing prerequisite. Please retry.');
                        return id;
                      }),
                      approved: true,
                      citations,
                    }));
                    validateMap(suggested);
                    setProposal(suggested);
                  } finally {
                    setWorking(false);
                  }
                })
              }
            >
              <Sparkles size={15} />
              {working ? 'Weaving…' : 'Suggest a route'}
            </button>
            <button
              className="primary"
              onClick={() =>
                setEdit({
                  id: crypto.randomUUID(),
                  courseId: course.id,
                  title: '',
                  description: '',
                  dependsOn: [],
                  approved: true,
                })
              }
            >
              <Plus size={16} />
              Add concept
            </button>
          </div>
        }
      />
      <SourceContext state={state} course={course} commit={commit} run={run} />
      <div className="map-legend">
        {['available', 'learning', 'reviewing', 'mastered', 'locked'].map((s) => (
          <span key={s}>
            <i className={s} />
            {s}
          </span>
        ))}
      </div>
      {proposal.length > 0 && (
        <Panel title="Proposed route · review before adding">
          <p>{proposal.map((t) => t.title).join(' → ')}</p>
          <p className="muted">Adds a new route; preserves your existing route and evidence.</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  await commit((s) => ({ ...s, topics: [...s.topics, ...proposal] }));
                  setProposal([]);
                })
              }
            >
              Accept route
            </button>
            <button className="secondary" onClick={() => setProposal([])}>
              Discard
            </button>
          </div>
        </Panel>
      )}
      {topics.length ? (
        <div className="map-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onClick}
            onConnect={connect}
            fitView
            minZoom={0.2}
            colorMode={state.settings.theme}
            nodesDraggable
            onNodeDragStop={(_event, node) =>
              run(() =>
                commit((s) => ({
                  ...s,
                  topics: s.topics.map((t) =>
                    t.id === node.id ? { ...t, position: node.position } : t,
                  ),
                })),
              )
            }
          >
            <Background gap={24} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      ) : (
        <Empty
          title="Start with one connection"
          description="Add concepts yourself or ask your local AI to suggest a route."
        />
      )}
      {edit && (
        <div className="modal-backdrop">
          <section className="modal">
            <h2>
              {topics.some((t) => t.id === edit.id) ? 'Your next connection' : 'Add a concept'}
            </h2>
            <Citations citations={edit.citations} />
            <Field label="Concept">
              <input
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Connection / description">
              <textarea
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </Field>
            <Field label="Prerequisites">
              <select
                multiple
                value={edit.dependsOn}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    dependsOn: Array.from(e.target.selectedOptions, (option) => option.value),
                  })
                }
              >
                {topics
                  .filter((t) => t.id !== edit.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="muted small">
              Ctrl+click to select or clear prerequisites. A prerequisite needs at least 61%
              demonstrated mastery.
            </p>
            <div className="button-row">
              <button
                className="primary"
                disabled={!edit.title.trim()}
                onClick={() =>
                  run(async () => {
                    await commit((s) => {
                      const topics = s.topics.some((t) => t.id === edit.id)
                        ? s.topics.map((t) => (t.id === edit.id ? edit : t))
                        : [...s.topics, edit];
                      validateMap(topics);
                      return { ...s, topics };
                    });
                    setEdit(null);
                  })
                }
              >
                Save concept
              </button>
              {topics.some((t) => t.id === edit.id) && (
                <button
                  className="secondary"
                  disabled={topicStatus(state, edit) === 'locked'}
                  onClick={() => {
                    learn(edit);
                    setEdit(null);
                  }}
                >
                  Open lesson
                </button>
              )}
              <button className="secondary" onClick={() => setEdit(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}
      <p className="muted small">
        Select a node to edit or open its lesson. Drag between handles to add a dependency. Your
        self-reported knowledge is checked, never automatically marked mastered.
      </p>
    </>
  );
}
