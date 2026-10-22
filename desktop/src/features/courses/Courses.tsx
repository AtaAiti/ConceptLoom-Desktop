import { Dialog } from '../../components/Dialog';
import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { PageHeading, Panel, Progress } from '../../components/ui';
import { CourseForm } from './CourseForm';
import { deleteCourse } from '../../learning/courses';
import { topicMastery } from '../../learning/mastery';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Workspace } from '../../types/state';

export function Courses({
  state,
  commit,
  select,
  run,
}: {
  state: Workspace;
  commit: Commit;
  select: (course: Course) => void;
  run: (task: () => Promise<void>) => void;
}) {
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="YOUR DESTINATIONS / COURSES"
        title="Follow your curiosity."
        description="Languages, ideas, and useful skills. Each with a path of its own."
        action={
          <button className="primary" onClick={() => setEditing('new')}>
            <Plus size={16} />
            Создать направление
          </button>
        }
      />
      <div className="flashcard-grid">
        {state.courses.map((course) => {
          const topics = state.topics.filter((t) => t.courseId === course.id);
          const progress = topics.length
            ? Math.round(
                topics.reduce((sum, t) => sum + topicMastery(state, t.id), 0) / topics.length,
              )
            : 0;
          return (
            <Panel key={course.id}>
              <div className="course-card-top">
                <div
                  className={`language-mark ${course.targetLanguage.toLowerCase() === 'korean' ? 'mint' : ''}`}
                >
                  {course.targetLanguage.toLowerCase() === 'korean'
                    ? '한'
                    : course.targetLanguage.toLowerCase() === 'english'
                      ? 'Aa'
                      : '✦'}
                </div>
                <span className="status-pill">
                  {course.currentLevel} → {course.targetLevel}
                </span>
              </div>
              <h2>{course.name}</h2>
              <p className="muted">{course.goal}</p>
              <Progress value={progress} />
              <p className="small muted">
                {progress}% demonstrated mastery · {topics.length} concepts
              </p>
              <div className="button-row">
                <button className="primary compact" onClick={() => select(course)}>
                  Открыть карту
                  <ArrowRight size={14} />
                </button>
                <button
                  aria-label={`Изменить ${course.name}`}
                  className="icon-button"
                  onClick={() => setEditing(course)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`Удалить ${course.name}`}
                  className="icon-button danger"
                  onClick={() => setDeleting(course)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
      {!state.courses.length && (
        <Panel>
          <p>
            Choose English, Korean, or a custom subject when you create a course. Everything starts
            at zero until you demonstrate understanding.
          </p>
        </Panel>
      )}
      {editing && (
        <Dialog label="Учебное направление" onClose={() => setEditing(null)}>
          <section className="modal wide">
            <div className="panel-heading">
              <h2>{editing === 'new' ? 'Создать учебное направление' : 'Изменить направление'}</h2>
              <button className="text-button" onClick={() => setEditing(null)}>
                Закрыть
              </button>
            </div>
            <CourseForm
              workspaceId={state.activeWorkspaceId}
              defaultLanguage={state.settings.explanationLanguage}
              key={editing === 'new' ? 'new' : editing.id}
              commit={commit}
              course={editing === 'new' ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          </section>
        </Dialog>
      )}
      {deleting && (
        <Dialog label="Удалить направление" onClose={() => setDeleting(null)}>
          <Panel title={`Удалить ${deleting.name}?`}>
            <p>This permanently removes its lessons, cards, notes, and progress.</p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    await commit((s) => deleteCourse(s, deleting.id));
                    setDeleting(null);
                  })
                }
              >
                Удалить направление
              </button>
              <button className="secondary" onClick={() => setDeleting(null)}>
                Keep course
              </button>
            </div>
          </Panel>
        </Dialog>
      )}
    </>
  );
}
