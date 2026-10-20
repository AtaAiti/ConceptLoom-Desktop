import { useState } from 'react';
import { Field } from '../../components/ui';
import { createCourse, initialTopics } from '../../learning/courses';
import type { Course } from '../../types/state';
import type { Commit } from '../../hooks/useWorkspace';

export function CourseForm({
  commit,
  onDone,
  course,
  initialName = 'My study path',
  defaultLanguage = 'Russian',
  workspaceId = 'my-learning',
}: {
  commit: Commit;
  onDone: (course: Course) => void;
  course?: Course;
  initialName?: string;
  defaultLanguage?: string;
  workspaceId?: string;
}) {
  const [name, setName] = useState(course?.name ?? initialName);
  const [goal, setGoal] = useState(course?.goal ?? '');
  const [subjectKind, setSubjectKind] = useState<Course['subjectKind']>(
    course?.subjectKind ?? (['English', 'Korean'].includes(initialName) ? 'language' : 'general'),
  );
  const [knowledge, setKnowledge] = useState(course?.knowledge ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [difficulty, setDifficulty] = useState<Course['difficulty']>(
    course?.difficulty ?? 'beginner',
  );
  const [targetDate, setTargetDate] = useState(course?.targetDate ?? '');
  const [currentLevel, setLevel] = useState(course?.currentLevel ?? 'Beginner');
  const [targetLevel, setTargetLevel] = useState(course?.targetLevel ?? 'Apply independently');
  const [explanationLanguage, setLanguage] = useState(
    course?.explanationLanguage ?? defaultLanguage,
  );
  const [targetLanguage, setTargetLanguage] = useState(course?.targetLanguage ?? initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
          const value = createCourse({
            ...course,
            workspaceId,
            description,
            difficulty,
            targetDate: targetDate || undefined,
            subjectKind,
            domain: {
              ...course?.domain,
              targetLanguage: subjectKind === 'language' ? targetLanguage : undefined,
            },
            name,
            goal,
            knowledge,
            currentLevel,
            targetLevel,
            explanationLanguage,
            targetLanguage: subjectKind === 'language' ? targetLanguage : '',
          });
          const saved = course ? { ...value, id: course.id, createdAt: course.createdAt } : value;
          await commit((state) => ({
            ...state,
            courses: course
              ? state.courses.map((c) => (c.id === course.id ? saved : c))
              : [...state.courses, saved],
            topics: course ? state.topics : [...state.topics, ...initialTopics(saved)],
          }));
          onDone(saved);
        } catch (e) {
          console.error(e);
          setError('Could not save the course. Check all fields and storage, then try again.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Название направления">
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Тип предмета">
        <select
          value={subjectKind}
          onChange={(e) => setSubjectKind(e.target.value as Course['subjectKind'])}
        >
          {[
            'general',
            'language',
            'programming',
            'stem',
            'humanities',
            'exam',
            'professional',
            'custom',
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      {subjectKind === 'language' && (
        <Field label="Target language or subject">
          <input
            required
            maxLength={100}
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
          />
        </Field>
      )}
      <Field label="Current level">
        <input required value={currentLevel} onChange={(e) => setLevel(e.target.value)} />
      </Field>
      <Field label="Difficulty">
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Course['difficulty'])}
        >
          {['beginner', 'intermediate', 'advanced'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="Target date (optional)">
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="Описание">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Target level">
        <input required value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} />
      </Field>
      <div className="span-2">
        <Field label="Чему вы хотите научиться?">
          <textarea required value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
      </div>
      <div className="span-2">
        <Field label="What do you already know? (We will check this together.)">
          <textarea
            value={knowledge}
            onChange={(e) => setKnowledge(e.target.value)}
            placeholder="Concepts you already know, previous experience…"
          />
        </Field>
      </div>
      <Field label="Language of explanations">
        <input required value={explanationLanguage} onChange={(e) => setLanguage(e.target.value)} />
      </Field>
      <div className="form-footer span-2">
        {!course && ['english', 'korean'].includes(targetLanguage.toLowerCase()) && (
          <p className="muted small" style={{ marginBottom: 12 }}>
            Creating this course accepts a starter dependency route, which you can edit on the map.
            {targetLanguage.toLowerCase() === 'korean'
              ? ' Hangul → sentence order → particles → polite speech → tenses → conversation.'
              : ' Sentence foundations → present and past → present perfect → comparisons → opinions → conversation.'}
            Your prior knowledge will be checked before teaching each connection.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={saving}>
          {saving ? 'Saving…' : course ? 'Save changes' : 'Создать направление'}
        </button>
      </div>
    </form>
  );
}
