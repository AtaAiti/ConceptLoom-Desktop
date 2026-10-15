import { useEffect, useMemo, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  BookOpen,
  ChartNoAxesCombined,
  Cpu,
  GitBranch,
  GraduationCap,
  House,
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
import { Workspaces } from './features/workspaces/Workspaces';
import { Roadmap } from './features/roadmap/Roadmap';
import { Today } from './features/dashboard/Today';
import { StudyHub } from './features/dashboard/StudyHub';
import { CommandPalette } from './components/CommandPalette';
import { workspaceView, mergeWorkspace } from './db/workspaces';
import type { Commit } from './hooks/useWorkspace';

const navigation = [
  { title: 'Home', icon: House },
  { title: 'Today', icon: Target },
  { title: 'Dashboard', icon: House },
  { title: 'Courses', icon: BookOpen },
  { title: 'Study', icon: GraduationCap },
  { title: 'Knowledge Map', icon: Map },
  { title: 'Roadmap', icon: GitBranch },
  { title: 'AI Tutor', icon: MessageCircle },
  { title: 'Statistics', icon: ChartNoAxesCombined },
  { title: 'Library', icon: LibraryIcon },
  { title: 'Settings', icon: SettingsIcon },
];
export default function App() {
  const { state: application, ready, error, commit: commitApplication } = useWorkspace();
  const activeId = application.activeWorkspaceId;
  const state = useMemo(() => workspaceView(application, activeId), [application, activeId]);
  const commit: Commit = (change) => commitApplication((s) => mergeWorkspace(s, activeId, change));
  const [page, setPage] = useState('Today');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sourcePreview, setSourcePreview] = useState({ id: '', request: 0 });
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
  const openWorkspace = (id: string) =>
    run(async () => {
      await commitApplication((s) => ({
        ...s,
        activeWorkspaceId: id,
        workspaces: s.workspaces.map((w) =>
          w.id === id ? { ...w, lastOpenedAt: new Date().toISOString() } : w,
        ),
      }));
      setCourseId('');
      setTopicId('');
      setPage('Dashboard');
      setNotice('');
    });
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.dataset.reducedMotion = String(state.settings.reducedMotion ?? false);
  }, [state.settings.theme, state.settings.reducedMotion]);
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
    <div
      className="app-shell"
      data-accent={application.workspaces.find((w) => w.id === activeId)?.accent ?? 'violet'}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={24} />
          </div>
          <div>
            ConceptLoom<small>YOUR LEARNING, CONNECTED</small>
          </div>
        </div>
        <label className="workspace-switcher">
          Workspace
          <select
            aria-label="Active workspace"
            value={activeId}
            onChange={(e) => openWorkspace(e.target.value)}
          >
            {application.workspaces
              .filter((w) => !w.archived)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.icon} {w.name}
                </option>
              ))}
          </select>
        </label>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.title}
              className={
                page === item.title ||
                (item.title === 'Study' && ['Learn', 'Flashcards', 'Reviews'].includes(page))
                  ? 'active'
                  : ''
              }
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
          <button className="secondary" onClick={() => setSearchOpen(true)}>
            Search · Ctrl+K
          </button>
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
        <main className="page-content" key={activeId}>
          {notice && (
            <div className="notice" role="alert">
              <span>{notice}</span>
              <button aria-label="Dismiss error" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'Dashboard' && <Dashboard state={state} navigate={setPage} learn={learn} />}
          {page === 'Today' && <Today state={state} navigate={setPage} learn={learn} />}
          {page === 'Study' && <StudyHub state={state} navigate={setPage} />}
          {page === 'Roadmap' && (
            <Roadmap
              state={state}
              course={course}
              learn={learn}
              edit={() => setPage('Knowledge Map')}
            />
          )}
          {page === 'Home' && (
            <Workspaces
              state={application}
              commit={commitApplication}
              open={openWorkspace}
              run={run}
            />
          )}
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
            <Library
              key={`${activeId}-${sourcePreview.request}`}
              initialSourceId={sourcePreview.id}
              state={state}
              commit={commit}
              run={run}
            />
          )}
          {page === 'Settings' && <Settings state={state} commit={commit} run={run} />}
        </main>
      </div>
      {searchOpen && (
        <CommandPalette
          state={state}
          close={() => setSearchOpen(false)}
          activate={(action) => {
            if (action.workspaceId) {
              openWorkspace(action.workspaceId);
              return;
            }
            if (action.courseId) setCourseId(action.courseId);
            if (action.topicId) setTopicId(action.topicId);
            if (action.sourceId)
              setSourcePreview((old) => ({ id: action.sourceId!, request: old.request + 1 }));
            if (action.page) setPage(action.page);
          }}
        />
      )}
    </div>
  );
}
