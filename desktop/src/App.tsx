import { useEffect, useMemo, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import { DesignIcon, type DesignIconName } from './components/DesignIcon';
import { WindowBar } from './components/WindowBar';
import { Home } from './features/dashboard/Home';
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

const navigation: { title: string; label: string; icon: DesignIconName; group: string }[] = [
  { title: 'Home', label: 'Главная', icon: 'imgHouse', group: 'global' },
  { title: 'Today', label: 'Сегодня', icon: 'imgSun', group: 'global' },
  { title: 'Workspaces', label: 'Пространства', icon: 'imgPanelsTopLeft1', group: 'global' },
  { title: 'Reviews', label: 'Повторение', icon: 'imgLayers2', group: 'global' },
  { title: 'Library', label: 'Источники', icon: 'imgFiles', group: 'workspace' },
  { title: 'Roadmap', label: 'Дорожная карта', icon: 'imgRoute', group: 'workspace' },
  { title: 'Knowledge Map', label: 'Карта знаний', icon: 'imgNetwork', group: 'workspace' },
  { title: 'AI Tutor', label: 'Репетитор', icon: 'imgSparkles', group: 'workspace' },
  { title: 'Study', label: 'Учебный центр', icon: 'imgGraduationCap', group: 'workspace' },
];
const pageLabels: Record<string, string> = {
  ...Object.fromEntries(navigation.map((n) => [n.title, n.label])),
  Settings: 'Настройки',
  Courses: 'Учебные направления',
  Dashboard: 'Обзор',
  Learn: 'Проверка знаний',
  Flashcards: 'Карточки',
  Statistics: 'Статистика',
  'Weak Areas': 'Слабые связи',
};
export default function App() {
  const { state: application, ready, error, commit: commitApplication } = useWorkspace();
  const activeId = application.activeWorkspaceId;
  const state = useMemo(() => workspaceView(application, activeId), [application, activeId]);
  const commit: Commit = (change) => commitApplication((s) => mergeWorkspace(s, activeId, change));
  const [page, setPage] = useState('Home');
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
      setPage('Today');
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
      className={`app-shell capybara ${page === 'Reviews' ? 'focus-mode' : ''}`}
      data-accent={application.workspaces.find((w) => w.id === activeId)?.accent ?? 'violet'}
    >
      <WindowBar onError={run} />
      <aside className="sidebar">
        <div className="brand">
          <DesignIcon name="imgWaypoints" />
          <span>ConceptLoom</span>
        </div>
        <label className="workspace-switcher">
          <DesignIcon name="imgDatabase" />
          <span>
            <small>ПРОСТРАНСТВО</small>
            <select
              aria-label="Active workspace"
              value={activeId}
              onChange={(e) => openWorkspace(e.target.value)}
            >
              {application.workspaces
                .filter((w) => !w.archived)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </span>
        </label>
        {['global', 'workspace'].map((group) => (
          <nav
            key={group}
            aria-label={group === 'global' ? 'Основная навигация' : 'Навигация пространства'}
          >
            {group === 'workspace' && (
              <div className="nav-label">
                {application.workspaces.find((w) => w.id === activeId)?.name}
              </div>
            )}
            {navigation
              .filter((n) => n.group === group)
              .map((item) => (
                <button
                  key={item.title}
                  aria-label={item.label}
                  className={
                    page === item.title ||
                    (item.title === 'Study' && ['Learn', 'Flashcards'].includes(page))
                      ? 'active'
                      : ''
                  }
                  onClick={() => setPage(item.title)}
                >
                  <DesignIcon name={item.icon} active={page === item.title} />
                  <span>{item.label}</span>
                  {item.title === 'Reviews' && (
                    <small className="nav-count">
                      {state.cards.filter((c) => new Date(c.due) <= new Date()).length}
                    </small>
                  )}
                </button>
              ))}
          </nav>
        ))}
        <div className="sidebar-bottom">
          <p className="privacy-note">
            <DesignIcon name="imgShieldCheck" />
            Ваши знания — на устройстве
          </p>
          <button className="settings-link" onClick={() => setPage('Settings')}>
            <DesignIcon name="imgSettings2" />
            Настройки
          </button>
          <div className="local-status">
            <span className={connection === 'Local AI ready' ? 'online' : 'offline'} />
            <div>
              <strong>Ollama · {state.settings.model}</strong>
              <small>
                {connection === 'Local AI ready'
                  ? 'Готова'
                  : connection === 'Model not downloaded'
                    ? 'Модель не загружена'
                    : 'Нет подключения'}{' '}
                · веб-доступ выключен
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <div className="topbar">
          {page === 'Reviews' ? (
            <div className="breadcrumbs">
              <button className="secondary compact" onClick={() => setPage('Study')}>
                <DesignIcon name="imgArrowLeft" />
                Учебный центр
              </button>
              <strong>Повторение</strong>
              <span>FSRS</span>
            </div>
          ) : (
            <div className="breadcrumbs">
              {page === 'Home' || page === 'Workspaces'
                ? 'Все пространства'
                : application.workspaces.find((w) => w.id === activeId)?.name}
              <DesignIcon name="imgChevronRight" />
              <strong>{pageLabels[page] ?? page}</strong>
            </div>
          )}
          <div className="topbar-right">
            {page === 'Reviews' ? (
              <button className="text-button" onClick={() => setPage('Study')}>
                Сохранить и выйти
              </button>
            ) : (
              <>
                {course && !['Home', 'Workspaces', 'Today', 'Library'].includes(page) && (
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
                <button className="toolbar-search" onClick={() => setSearchOpen(true)}>
                  <DesignIcon name="imgSearch" />
                  <span>Поиск по знаниям</span>
                  <kbd>Ctrl+K</kbd>
                </button>
                <button
                  className="theme-toggle"
                  aria-label="Сменить тему"
                  onClick={() =>
                    run(() =>
                      commit((s) => ({
                        ...s,
                        settings: {
                          ...s.settings,
                          theme: s.settings.theme === 'dark' ? 'light' : 'dark',
                        },
                      })),
                    )
                  }
                >
                  <DesignIcon name="imgMoon" />
                </button>
              </>
            )}
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
          {page === 'Home' && <Home state={application} navigate={setPage} open={openWorkspace} />}
          {page === 'Workspaces' && (
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
