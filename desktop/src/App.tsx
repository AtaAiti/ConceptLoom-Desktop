import { useWorkspace } from './hooks/useWorkspace';
import { PageHeading, Panel } from './components/ui';
import { phases } from './learning/conceptloom';

export default function App() {
  const { ready, error } = useWorkspace();
  return <main className="page-content"><PageHeading eyebrow="PRIVATE / LOCAL FIRST" title="ConceptLoom Desktop" description="Your learning, connected."/><Panel title="Locate → Weave → Build"><p>{error || (ready ? 'Local storage is ready. Course and lesson screens arrive in the next milestone.' : 'Opening local storage…')}</p>{phases.map(phase => <p key={phase.name}>{phase.name}: {phase.detail}</p>)}</Panel></main>;
}
