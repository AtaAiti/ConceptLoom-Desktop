import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../types/state';

export interface SearchAction {
  label: string;
  page?: string;
  workspaceId?: string;
  courseId?: string;
  topicId?: string;
  sourceId?: string;
}
export function CommandPalette({
  state,
  activate,
  close,
}: {
  state: Workspace;
  activate: (action: SearchAction) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => previous?.focus();
  }, []);
  const actions: SearchAction[] = [
    { label: 'Go to Today', page: 'Today' },
    { label: 'Start reviews', page: 'Reviews' },
    { label: 'Create or edit cards', page: 'Flashcards' },
    { label: 'Ask tutor', page: 'AI Tutor' },
    ...state.workspaces
      .filter((w) => !w.archived)
      .map((w) => ({ label: `Workspace · ${w.name}`, workspaceId: w.id })),
    ...state.courses.map((c) => ({
      label: `Study path · ${c.name}`,
      page: 'Roadmap',
      courseId: c.id,
    })),
    ...state.sources.map((s) => ({
      label: `Source · ${s.title}`,
      page: 'Library',
      sourceId: s.id,
    })),
    ...state.topics.map((t) => ({
      label: `Понятие · ${t.title}`,
      page: 'Learn',
      courseId: t.courseId,
      topicId: t.id,
    })),
    ...state.cards.map((c) => ({
      label: `Card · ${c.front.slice(0, 100)}`,
      page: 'Flashcards',
      courseId: c.courseId,
    })),
    ...state.messages.map((m) => ({
      label: `Chat · ${m.content.slice(0, 100)}`,
      page: 'AI Tutor',
      courseId: m.courseId,
    })),
  ];
  const found = actions
    .filter((a) => a.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .slice(0, 40);
  return (
    <div className="modal-backdrop">
      <section
        ref={root}
        className="modal command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
          if (e.key === 'Tab') {
            const items = root.current?.querySelectorAll<HTMLElement>('input,button');
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
          if (e.key === 'ArrowDown' && document.activeElement === input.current) {
            e.preventDefault();
            root.current?.querySelector<HTMLButtonElement>('.search-result')?.focus();
          }
        }}
      >
        <h2>Search your learning space</h2>
        <input
          ref={input}
          aria-label="Search and commands"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a source, concept, card or action…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && found[0]) {
              e.preventDefault();
              activate(found[0]);
              close();
            }
          }}
        />
        <div>
          {found.map((a, i) => (
            <button
              className="search-result"
              key={i}
              onClick={() => {
                activate(a);
                close();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {!found.length && <p>No matches in this workspace.</p>}
        <button className="secondary" onClick={close}>
          Закрыть поиск
        </button>
      </section>
    </div>
  );
}
