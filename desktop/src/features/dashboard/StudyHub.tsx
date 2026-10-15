import { PageHeading, Panel } from '../../components/ui';
import type { Workspace } from '../../types/state';

export function StudyHub({
  state,
  navigate,
}: {
  state: Workspace;
  navigate: (page: string) => void;
}) {
  const modes = [
    {
      page: 'Learn',
      title: 'Learn one connection',
      description:
        'Locate your frontier, then practice recognition, recall, application and transfer.',
      action: 'Open lesson',
    },
    {
      page: 'Flashcards',
      title: 'Your flashcards',
      description: `${state.cards.length} cards in this workspace. Create, edit and inspect source-backed cards.`,
      action: 'Flashcards',
    },
    {
      page: 'Reviews',
      title: 'Spaced recall',
      description: `${state.cards.filter((c) => new Date(c.due) <= new Date()).length} cards due. Recall before revealing, then rate your answer with FSRS.`,
      action: 'Reviews',
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="STUDY / ACTIVE PRACTICE"
        title="Choose your next useful effort."
        description="Remember a connection, apply it, then try it in a new context."
      />
      <div className="flashcard-grid">
        {modes.map((mode) => (
          <Panel key={mode.page} title={mode.title}>
            <p className="muted">{mode.description}</p>
            <button className="primary" onClick={() => navigate(mode.page)}>
              {mode.action}
            </button>
          </Panel>
        ))}
      </div>
    </>
  );
}
