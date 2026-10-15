import { SourceDialogs } from './SourceDialogs';
import { useState } from 'react';
import { Field, PageHeading, Panel } from '../../components/ui';
import type { Commit } from '../../hooks/useWorkspace';
import type { Course, Workspace } from '../../types/state';
import type { Source, SourcePage } from '../../types/sources';
import { materialText, materialTitle, readMaterialPages, MAX_TEXT_CHARACTERS } from './materials';
import { sourceIndex, type SourceIndexService } from './sourceIndex';

export function Library({
  state,
  commit,
  run,
  initialSourceId,
}: {
  state: Workspace;
  course?: Course;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
  initialSourceId?: string;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [libraryId, setLibraryId] = useState(state.libraries[0]?.id ?? '');
  const [libraryName, setLibraryName] = useState('');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Awaited<ReturnType<SourceIndexService['search']>>>([]);
  const [edit, setEdit] = useState<Source | null>(null);
  const [preview, setPreview] = useState<Source | null>(
    state.sources.find((s) => s.id === initialSourceId) ?? null,
  );
  const [page, setPage] = useState(0);
  const [removing, setRemoving] = useState<Source | null>(null);
  const [limit, setLimit] = useState(30);
  const sources = state.sources.filter((s) => !libraryId || s.libraryIds.includes(libraryId));
  async function add(pages: SourcePage[], file?: File) {
    const now = new Date().toISOString();
    const destination = libraryId || state.libraries[0]?.id || crypto.randomUUID();
    const heading = materialTitle(file?.name ?? title, pages.map((p) => p.text).join('\n'));
    const source: Source = {
      id: crypto.randomUUID(),
      workspaceId: state.activeWorkspaceId,
      libraryIds: [destination],
      courseIds: [],
      title: heading,
      type: file
        ? /\.pdf$/i.test(file.name)
          ? 'pdf'
          : /\.(md|markdown)$/i.test(file.name)
            ? 'markdown'
            : 'txt'
        : 'pasted',
      originalFilename: file?.name,
      size: file?.size,
      importedAt: now,
      pageCount: pages[0]?.page ? pages.length : undefined,
      pages,
      tags: [],
    };
    setStatus(`Indexing ${heading}…`);
    await commit((s) => ({
      ...s,
      libraries: s.libraries.some((l) => l.id === destination)
        ? s.libraries
        : [
            ...s.libraries,
            {
              id: destination,
              workspaceId: s.activeWorkspaceId,
              name: 'My sources',
              createdAt: now,
            },
          ],
      sources: [...s.sources, source],
    }));
    setLibraryId(destination);
    setStatus(`Added ${heading} · indexed locally.`);
  }
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE / SOURCES"
        title="Bring your own starting points."
        description="PDF pages, text and Markdown. Search locally, then choose what your tutor uses."
        action={
          <label className="secondary upload-button">
            Import PDF / TXT / Markdown
            <input
              type="file"
              aria-label="Import learning material"
              accept=".pdf,.txt,.md,.markdown"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                run(async () => {
                  setBusy(true);
                  setStatus(`Reading ${file.name}…`);
                  try {
                    await add(await readMaterialPages(file, setStatus), file);
                  } catch (error) {
                    setStatus('Import failed. Your existing materials have been kept.');
                    throw error;
                  } finally {
                    setBusy(false);
                  }
                });
              }}
            />
          </label>
        }
      />
      <Panel title="Libraries">
        <div className="button-row">
          <label>
            Destination library{' '}
            <select
              aria-label="Library"
              value={libraryId}
              onChange={(e) => {
                setLibraryId(e.target.value);
                setMatches([]);
              }}
            >
              <option value="">All libraries</option>
              {state.libraries.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form
          className="button-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const id = crypto.randomUUID();
              await commit((s) => ({
                ...s,
                libraries: [
                  ...s.libraries,
                  {
                    id,
                    workspaceId: s.activeWorkspaceId,
                    name: libraryName.trim(),
                    createdAt: new Date().toISOString(),
                  },
                ],
              }));
              setLibraryId(id);
              setLibraryName('');
            });
          }}
        >
          <input
            aria-label="New library name"
            placeholder="Lecture notes, Textbook, Research…"
            required
            maxLength={100}
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
          />
          <button className="secondary" disabled={!libraryName.trim()}>
            Create library
          </button>
        </form>
        <form
          className="button-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = await sourceIndex.search(
                state,
                libraryId ? { kind: 'library', libraryId } : { kind: 'all' },
                query,
              );
              setMatches(result);
              setStatus(`${result.length} matching passages.`);
            });
          }}
        >
          <input
            aria-label="Search source text"
            placeholder="Find a passage in your materials…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="secondary">Search sources</button>
        </form>
        {matches.map((m) => (
          <button
            className="search-result"
            key={m.id}
            onClick={() => {
              const source = state.sources.find((s) => s.id === m.sourceId);
              if (source) {
                setPreview(source);
                setPage(
                  Math.max(
                    0,
                    source.pages.findIndex((p) => p.page === m.page),
                  ),
                );
              }
            }}
          >
            <strong>
              {state.sources.find((s) => s.id === m.sourceId)?.title}{' '}
              {m.page ? `· p. ${m.page}` : ''}
            </strong>
            <span>{m.text.slice(0, 240)}</span>
          </button>
        ))}
      </Panel>
      {status && (
        <p role="status" className="muted small">
          {status}
        </p>
      )}
      <Panel title="Paste text or write a note">
        <p className="muted small">
          PDF: up to 25 MB / 300 pages. Text: up to 1,000,000 characters. Scans need a text layer.
          Original files stay where you imported them; the app saves extracted text.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              setBusy(true);
              try {
                await add([{ page: null, text: materialText(content) }]);
                setTitle('');
                setContent('');
              } finally {
                setBusy(false);
              }
            });
          }}
        >
          <Field label="Title (optional)">
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Copied text / notes">
            <textarea
              required
              maxLength={MAX_TEXT_CHARACTERS}
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
        {sources.slice(0, limit).map((source) => (
          <Panel key={source.id} title={source.title}>
            <span className="status-pill">
              LOCAL · Indexed · {source.type.toUpperCase()}
              {source.pageCount ? ` · ${source.pageCount} pages` : ''}
            </span>
            <p className="prose note-content">
              {source.pages[0].page ? `Page ${source.pages[0].page}\n` : ''}
              {source.pages[0].text.slice(0, 600)}
            </p>
            <p className="muted small">{source.tags.join(' · ')}</p>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => {
                  setPreview(source);
                  setPage(0);
                }}
              >
                Preview
              </button>
              <button className="text-button" onClick={() => setEdit(source)}>
                Edit source
              </button>
              <button className="text-button danger" onClick={() => setRemoving(source)}>
                Remove note
              </button>
            </div>
          </Panel>
        ))}
      </div>
      {sources.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + 30)}>
          Show more sources
        </button>
      )}
      <SourceDialogs
        state={state}
        commit={commit}
        run={run}
        edit={edit}
        setEdit={setEdit}
        preview={preview}
        setPreview={setPreview}
        page={page}
        setPage={setPage}
        removing={removing}
        setRemoving={setRemoving}
        onRemoved={() => setMatches([])}
      />
    </>
  );
}
