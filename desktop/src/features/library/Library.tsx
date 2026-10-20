import { SourceDialogs } from './SourceDialogs';
import { DesignIcon } from '../../components/DesignIcon';
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
  const [libraryId, setLibraryId] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSourceId ?? state.sources[0]?.id ?? '');
  const [format, setFormat] = useState('all');
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
  const sources = state.sources.filter(
    (s) =>
      (!libraryId || s.libraryIds.includes(libraryId)) && (format === 'all' || s.type === format),
  );
  const selected = sources.find((s) => s.id === selectedId) ?? sources[0];
  const selectedPage = selected?.pages[Math.min(page, selected.pages.length - 1)];
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
    setStatus(`Индексируем ${heading}…`);
    await commit((s) => ({
      ...s,
      libraries: s.libraries.some((l) => l.id === destination)
        ? s.libraries
        : [
            ...s.libraries,
            {
              id: destination,
              workspaceId: s.activeWorkspaceId,
              name: 'Мои источники',
              createdAt: now,
            },
          ],
      sources: [...s.sources, source],
    }));
    setLibraryId(destination);
    setSelectedId(source.id);
    setPage(0);
    setPasteOpen(false);
    setStatus(`Добавлен ${heading} · доступен для локального поиска.`);
  }
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Источники"
        description="Ваш материал — основа объяснений, связей и проверок"
        action={
          <div className="button-row">
            <button className="secondary" onClick={() => setPasteOpen(true)}>
              Вставить текст
            </button>
            <label className="primary upload-button">
              <DesignIcon name="imgPlus" />
              Импортировать
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
                    setStatus(`Читаем ${file.name}…`);
                    try {
                      await add(await readMaterialPages(file, setStatus), file);
                    } catch (error) {
                      setStatus('Не удалось импортировать. Существующие материалы сохранены.');
                      throw error;
                    } finally {
                      setBusy(false);
                    }
                  });
                }}
              />
            </label>
          </div>
        }
      />
      <form
        className="sources-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await sourceIndex.search(
              state,
              libraryId ? { kind: 'library', libraryId } : { kind: 'all' },
              query,
            );
            setMatches(result);
            setStatus(`Найдено фрагментов: ${result.length}`);
          });
        }}
      >
        <input
          aria-label="Search source text"
          placeholder="Найти файл, тему или фрагмент"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary compact">Найти</button>
        <select
          aria-label="Формат источника"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="all">Все форматы</option>
          <option value="pdf">PDF</option>
          <option value="txt">TXT</option>
          <option value="markdown">Markdown</option>
          <option value="pasted">Заметки</option>
        </select>
      </form>
      {status && (
        <p role="status" className="muted small import-status">
          {status}
        </p>
      )}
      {matches.length > 0 && (
        <Panel title="Найденные фрагменты">
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
                {state.sources.find((s) => s.id === m.sourceId)?.title}
                {m.page ? ` · с. ${m.page}` : ''}
              </strong>
              <span>{m.text.slice(0, 240)}</span>
            </button>
          ))}
        </Panel>
      )}
      <div className="sources-layout">
        <aside className="library-sidebar">
          <small>БИБЛИОТЕКИ</small>
          <button
            className={!libraryId ? 'active' : ''}
            onClick={() => {
              setLibraryId('');
              setPage(0);
              setMatches([]);
            }}
          >
            <DesignIcon name="imgFiles" />
            Все источники<small>{state.sources.length}</small>
          </button>
          {state.libraries.map((l) => (
            <button
              key={l.id}
              className={libraryId === l.id ? 'active' : ''}
              onClick={() => {
                setLibraryId(l.id);
                setPage(0);
                setMatches([]);
              }}
            >
              <DesignIcon name="imgFolder" />
              {l.name}
              <small>{state.sources.filter((s) => s.libraryIds.includes(l.id)).length}</small>
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!libraryName.trim()) return;
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
              placeholder="Название библиотеки"
              maxLength={100}
              required
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
            />
            <button className="text-button" disabled={!libraryName.trim()}>
              + Новая библиотека
            </button>
          </form>
          <div className="library-storage">
            <DesignIcon name="imgHardDrive" />
            <small>
              {(state.sources.reduce((sum, s) => sum + (s.size ?? 0), 0) / 1024 / 1024).toFixed(1)}{' '}
              МБ исходных файлов
            </small>
            <small>Извлечённый текст хранится на этом компьютере</small>
          </div>
        </aside>
        <section className="source-list" aria-label="Список источников">
          <div className="source-list-heading">
            <span>ИМЯ И МЕТАДАННЫЕ</span>
            <span>СОСТОЯНИЕ</span>
          </div>
          {sources.slice(0, limit).map((source) => (
            <button
              key={source.id}
              className={`source-row ${selected?.id === source.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedId(source.id);
                setPage(0);
              }}
            >
              <div className="section-line">
                <span className="source-type">
                  {source.type === 'markdown'
                    ? 'MD'
                    : source.type === 'pasted'
                      ? 'TXT'
                      : source.type.toUpperCase()}
                </span>
                <strong>{source.title}</strong>
                <span className="ready-pill">Готово</span>
              </div>
              <small>
                {source.pageCount ? `${source.pageCount} с. · ` : ''}
                {source.size ? `${(source.size / 1024).toFixed(0)} КБ · ` : ''}
                {new Date(source.importedAt).toLocaleDateString('ru-RU')} {source.tags.join(' · ')}
              </small>
            </button>
          ))}
          {!sources.length && (
            <div className="empty">
              <h3>Добавьте первый источник</h3>
              <p>Импортируйте PDF, TXT, Markdown или вставьте скопированный текст.</p>
              <button className="secondary" onClick={() => setPasteOpen(true)}>
                Вставить текст
              </button>
            </div>
          )}
          {sources.length > limit && (
            <button className="text-button" onClick={() => setLimit(limit + 30)}>
              Показать ещё
            </button>
          )}
        </section>
        <Panel className="source-preview">
          {selected ? (
            <>
              <div className="section-line">
                <h2>{selected.title}</h2>
                <button className="text-button" onClick={() => setEdit(selected)}>
                  Изменить
                </button>
              </div>
              <div className="source-page-controls">
                <span className="status-pill">{selected.type.toUpperCase()}</span>
                <small>
                  {selectedPage?.page ?? 1} / {selected.pages.length} с.
                </small>
              </div>
              <div className="document-paper">
                {selectedPage?.text || 'На этой странице нет текстового слоя.'}
              </div>
              <div className="source-page-controls">
                <button disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>
                  ←
                </button>
                <small>Извлечённый текст страницы</small>
                <button
                  disabled={page >= selected.pages.length - 1}
                  onClick={() => setPage(page + 1)}
                >
                  →
                </button>
              </div>
              <hr />
              <small>ЛОКАЛЬНЫЙ ИСТОЧНИК</small>
              <p className="muted small">
                {selected.tags.length
                  ? selected.tags.join(' · ')
                  : 'Добавьте теги и прикрепите материал к учебному направлению.'}
              </p>
              <div className="button-row">
                <button className="secondary" onClick={() => setPreview(selected)}>
                  Открыть фрагмент
                </button>
                <button className="text-button" onClick={() => setEdit(selected)}>
                  Настроить источник
                </button>
                <button className="text-button danger" onClick={() => setRemoving(selected)}>
                  Удалить
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Предпросмотр источника</h2>
              <p className="muted">
                Выберите материал слева. Здесь появятся страницы и сведения об источнике.
              </p>
            </>
          )}
        </Panel>
      </div>
      {pasteOpen && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Вставить текст">
            <h2>Текст или заметка</h2>
            <p className="muted small">
              До 1 000 000 символов. Сохраняется в выбранной библиотеке.
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
              <Field label="Название (необязательно)">
                <input
                  autoFocus
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Скопированный текст / заметки">
                <textarea
                  required
                  maxLength={MAX_TEXT_CHARACTERS}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </Field>
              <div className="button-row">
                <button className="primary" disabled={busy || !content.trim()}>
                  {busy ? 'Добавляем…' : 'Добавить в библиотеку'}
                </button>
                <button type="button" className="secondary" onClick={() => setPasteOpen(false)}>
                  Отмена
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <SourceDialogs
        state={state}
        commit={commit}
        run={run}
        edit={edit}
        setEdit={setEdit}
        preview={preview}
        setPreview={setPreview}
        page={preview ? Math.min(page, preview.pages.length - 1) : page}
        setPage={setPage}
        removing={removing}
        setRemoving={setRemoving}
        onRemoved={() => {
          setMatches([]);
          setPage(0);
        }}
      />
    </>
  );
}
