import { useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Empty, Field, PageHeading, Panel } from '../../components/ui';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Workspace } from '../../types/state';
import { materialText, materialTitle, readMaterial, MAX_TEXT_CHARACTERS } from './materials';

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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  if (!course)
    return (
      <Empty
        title="A home for your source material"
        description="Create a course, then import PDFs or paste text into your library."
      />
    );
  const notes = state.notes.filter((n) => n.courseId === course.id);
  return (
    <>
      <PageHeading
        eyebrow="YOUR SOURCES / LIBRARY"
        title="Bring your own starting points."
        description="Import PDF, TXT, Markdown, or paste copied text. Your materials stay on this computer."
        action={
          <label className="secondary upload-button">
            <Upload size={16} />
            Import PDF / TXT / Markdown
            <input
              type="file"
              aria-label="Import learning material"
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                run(async () => {
                  setBusy(true);
                  setStatus(`Reading ${file.name}…`);
                  try {
                    const text = await readMaterial(file, setStatus);
                    await commit((s) => ({
                      ...s,
                      notes: [
                        ...s.notes,
                        {
                          id: crypto.randomUUID(),
                          courseId: course.id,
                          title: materialTitle(file.name, text),
                          content: text,
                          createdAt: new Date().toISOString(),
                        },
                      ],
                    }));
                    setStatus(`Added ${file.name} to ${course.name}.`);
                  } catch (error) {
                    setStatus('Import failed. Your existing materials have been kept.');
                    throw error;
                  } finally {
                    setBusy(false);
                  }
                });
                e.target.value = '';
              }}
            />
          </label>
        }
      />
      {status && (
        <p role="status" className="muted small" style={{ marginBottom: 16 }}>
          {status}
        </p>
      )}
      <Panel title="Paste text or write a note">
        <p className="muted small" style={{ marginBottom: 16 }}>
          Paste copied text below with Ctrl+V. A title is optional. PDF: up to 25 MB / 300 pages;
          saved text: up to 1,000,000 characters.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              setBusy(true);
              try {
                const text = materialText(content);
                const heading = materialTitle(title, text);
                await commit((s) => ({
                  ...s,
                  notes: [
                    ...s.notes,
                    {
                      id: crypto.randomUUID(),
                      courseId: course.id,
                      title: heading,
                      content: text,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }));
                setTitle('');
                setContent('');
                setStatus(`Added ${heading} to ${course.name}.`);
              } finally {
                setBusy(false);
              }
            });
          }}
        >
          <Field label="Title (optional)">
            <input
              placeholder="Leave empty to use the first line of your text"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Copied text / notes">
            <textarea
              required
              maxLength={MAX_TEXT_CHARACTERS}
              placeholder="Paste your text here (Ctrl+V)…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
          <button className="primary" disabled={busy || !content.trim()}>
            {busy ? 'Adding material…' : 'Add text to library'}
          </button>
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
