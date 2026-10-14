import { useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Empty, Field, PageHeading, Panel } from '../../components/ui';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Workspace } from '../../types/state';

export function Library({
  state,
  course,
  commit,
  run,
}: {
  state: Workspace;
  course?: Course;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  if (!course)
    return (
      <Empty
        title="A home for your source material"
        description="Create a course, then add TXT and Markdown notes."
      />
    );
  const notes = state.notes.filter((n) => n.courseId === course.id);
  return (
    <>
      <PageHeading
        eyebrow="YOUR SOURCES / LIBRARY"
        title="Bring your own starting points."
        description="TXT and Markdown notes stay local. Recent notes provide context for your tutor."
        action={
          <label className="secondary upload-button">
            <Upload size={16} />
            Import TXT / Markdown
            <input
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                run(async () => {
                  if (file.size > 200000)
                    throw new Error('Please use a text file smaller than 200 KB for this version.');
                  if (!/\.(txt|md|markdown)$/i.test(file.name))
                    throw new Error('Choose a TXT or Markdown file.');
                  const text = await file.text();
                  await commit((s) => ({
                    ...s,
                    notes: [
                      ...s.notes,
                      {
                        id: crypto.randomUUID(),
                        courseId: course.id,
                        title: file.name,
                        content: text,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }));
                });
                e.target.value = '';
              }}
            />
          </label>
        }
      />
      <Panel title="A note for your course">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await commit((s) => ({
                ...s,
                notes: [
                  ...s.notes,
                  {
                    id: crypto.randomUUID(),
                    courseId: course.id,
                    title,
                    content,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }));
              setTitle('');
              setContent('');
            });
          }}
        >
          <Field label="Title">
            <input
              required
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Notes / Markdown">
            <textarea required value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <button className="primary">Save note</button>
        </form>
      </Panel>
      <div className="flashcard-grid">
        {notes.map((note) => (
          <Panel title={note.title} key={note.id}>
            <p className="prose note-content">{note.content}</p>
            <button
              className="text-button danger"
              onClick={() =>
                run(async () => {
                  await commit((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== note.id) }));
                })
              }
            >
              <Trash2 size={14} />
              Remove note
            </button>
          </Panel>
        ))}
      </div>
    </>
  );
}
