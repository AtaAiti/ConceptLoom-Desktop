import { useEffect, useMemo, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  BookOpen,
  ChartNoAxesCombined,
  Cpu,
  GitBranch,
  GraduationCap,
  House,
  Layers,
  Library as LibraryIcon,
  Map,
  MessageCircle,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import { OllamaProvider } from './ai/providers/ollama';
import { errorMessage } from './components/ui';
import { Dashboard } from './features/dashboard/Dashboard';
import { Courses } from './features/courses/Courses';
import { KnowledgeMap } from './features/knowledge-map/KnowledgeMap';
import { LessonScreen } from './features/lessons/LessonScreen';
import { Flashcards } from './features/flashcards/Flashcards';
import { Reviews } from './features/reviews/Reviews';
import { Tutor } from './features/tutor/Tutor';
import { Statistics } from './features/statistics/Statistics';
import { Library } from './features/library/Library';
import { Settings } from './features/settings/Settings';
import { Onboarding } from './features/onboarding/Onboarding';
import { frontier } from './learning/conceptloom';
import type { Topic } from './types/state';

const navigation = [
  { title: 'Dashboard', icon: House },
  { title: 'Courses', icon: BookOpen },
  { title: 'Learn', icon: GraduationCap },
  { title: 'Knowledge Map', icon: Map },
  { title: 'Flashcards', icon: Layers },
  { title: 'Reviews', icon: Target },
  { title: 'AI Tutor', icon: MessageCircle },
  { title: 'Statistics', icon: ChartNoAxesCombined },
  { title: 'Weak Areas', icon: Target },
  { title: 'Library', icon: LibraryIcon },
  { title: 'Settings', icon: SettingsIcon },
];
export default function App() {
  const { state, ready, error, commit } = useWorkspace();
  const [page, setPage] = useState('Dashboard');
  const [courseId, setCourseId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('Checking local AI…');
  const provider = useMemo(
    () => new OllamaProvider(state.settings.endpoint, state.settings.model),
    [state.settings.endpoint, state.settings.model],
  );
  const course = state.courses.find((c) => c.id === courseId) ?? state.courses[0];
  const topic =
    state.topics.find((t) => t.id === topicId && t.courseId === course?.id) ??
    (course ? frontier(state, course.id)[0] : undefined);
  const run = (task: () => Promise<void>) => {
    setNotice('');
    void task().catch((e) => setNotice(errorMessage(e)));
  };
  const learn = (topic: Topic) => {
    setCourseId(topic.courseId);
    setTopicId(topic.id);
    setPage('Learn');
  };
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, state.settings.onboardingComplete]);
  useEffect(() => {
    let active = true;
    const check = () =>
      provider
        .models()
        .then((models) => {
          if (active)
            setConnection(
              models.includes(state.settings.model) ? 'Local AI ready' : 'Model not downloaded',
            );
        })
        .catch(() => {
          if (active) setConnection('Local AI offline');
        });
    void check();
    const timer = window.setInterval(() => {
      void check();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [provider, state.settings.model]);
  if (error)
    return (
      <main className="fatal">
        <h1>Your saved data needs attention.</h1>
        <p>{error}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Retry loading
        </button>
      </main>
    );
  if (!ready)
    return (
      <main className="fatal">
        <GitBranch size={40} />
        <h1>Opening your learning space…</h1>
      </main>
    );
  if (!state.settings.onboardingComplete) return <Onboarding state={state} commit={commit} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={24} />
          </div>
          <div>
            ConceptLoom<small>YOUR LEARNING, CONNECTED</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.title}
              className={page === item.title ? 'active' : ''}
              onClick={() => setPage(item.title)}
            >
              <item.icon size={18} />
              <span>{item.title}</span>
              {item.title === 'Reviews' &&
                state.cards.some((c) => new Date(c.due) <= new Date()) && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className={connection === 'Local AI ready' ? 'online' : 'offline'} />
            <div>
              <strong>{connection}</strong>
              <small>{state.settings.model}</small>
            </div>
            <Cpu size={16} />
          </div>
          <div className="local-profile">
            <div>Y</div>
            <span>
              Your learning space<small>Private & local</small>
            </span>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            {!isTauri() && <span className="preview-label">Browser preview</span>}
            {course && (
              <select
                aria-label="Active course"
                value={course.id}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setTopicId('');
                }}
              >
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <span className="local-badge">
              <ShieldCheck size={13} />
              LOCAL FIRST
            </span>
          </div>
        </div>
        <main className="page-content">
          {notice && (
            <div className="notice" role="alert">
              <span>{notice}</span>
              <button aria-label="Dismiss error" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'Dashboard' && <Dashboard state={state} navigate={setPage} learn={learn} />}
          {page === 'Courses' && (
            <Courses
              state={state}
              commit={commit}
              select={(c) => {
                setCourseId(c.id);
                setPage('Knowledge Map');
              }}
              run={run}
            />
          )}
          {page === 'Knowledge Map' && (
            <KnowledgeMap
              key={course?.id}
              state={state}
              course={course}
              commit={commit}
              provider={provider}
              learn={learn}
              run={run}
            />
          )}
          {page === 'Learn' && (
            <LessonScreen
              state={state}
              course={course}
              topic={topic}
              commit={commit}
              provider={provider}
              run={run}
              select={learn}
            />
          )}
          {page === 'Flashcards' && (
            <Flashcards key={course?.id} state={state} course={course} commit={commit} run={run} />
          )}
          {page === 'Reviews' && <Reviews state={state} commit={commit} run={run} />}
          {page === 'AI Tutor' && (
            <Tutor
              key={course?.id}
              state={state}
              course={course}
              topic={topic}
              commit={commit}
              provider={provider}
              run={run}
            />
          )}
          {(page === 'Statistics' || page === 'Weak Areas') && (
            <Statistics state={state} weakOnly={page === 'Weak Areas'} />
          )}
          {page === 'Library' && (
            <Library key={course?.id} state={state} course={course} commit={commit} run={run} />
          )}
          {page === 'Settings' && <Settings state={state} commit={commit} run={run} />}
        </main>
      </div>
    </div>
  );
}
