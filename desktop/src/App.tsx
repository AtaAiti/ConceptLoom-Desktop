import { useEffect, useMemo, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import { DesignIcon, type DesignIconName } from './components/DesignIcon';
import { WindowBar } from './components/WindowBar';
import { Home } from './features/dashboard/Home';
import { useWorkspace } from './hooks/useWorkspace';
import { createProvider, accountStatus, providerNames } from './ai/providers/accounts';
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
import { SourceTutorBridge } from './features/tutor/SourceTutorBridge';
import { restoreTutorDraft, type TutorDraft } from './features/tutor/draft';

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
  const [sourcePreview, setSourcePreview] = useState({ id: '', request: 0, pageIndex: 0 });
  const [tutorDrafts, setTutorDrafts] = useState<Record<string, TutorDraft>>({});
  const [tutorBusy, setTutorBusy] = useState<Record<string, boolean>>({});
  const [courseId, setCourseId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('Checking local AI…');
  const provider = useMemo(() => createProvider(state.settings), [state.settings]);
  const course = state.courses.find((c) => c.id === courseId) ?? state.courses[0];
  const tutorKey = JSON.stringify([activeId, course?.id]);
  const tutorDraft = tutorDrafts[tutorKey] ?? restoreTutorDraft(state, course?.id);
  const topic =
    state.topics.find((t) => t.id === topicId && t.courseId === course?.id) ??
    (course ? frontier(state, course.id)[0] : undefined);
  const run = (task: () => Promise<void>) => {
    setNotice('');
    void task().catch((e) => {
      const message = errorMessage(e);
      setNotice(message);
      window.dispatchEvent(new CustomEvent('conceptloom:error', { detail: message }));
    });
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
      state.settings.provider !== 'ollama'
        ? accountStatus(state.settings.provider)
            .then((status) => {
              if (active)
                setConnection(
                  !status.compatible
                    ? 'Клиент недоступен'
                    : status.login === 'account'
                      ? 'Аккаунт подключён'
                      : status.login === 'unknown'
                        ? 'Клиент готов · вход через Google'
                        : 'Проверьте вход в настройках',
                );
            })
            .catch(() => {
              if (active) setConnection('Проверьте вход в настройках');
            })
        : provider
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
  }, [provider, state.settings.model, state.settings.provider]);
  if (error)
    return (
      <main className="fatal">
        <WindowBar onError={run} />
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
        <WindowBar onError={run} />
        <GitBranch size={40} />
        <h1>Opening your learning space…</h1>
      </main>
    );
  if (!state.settings.onboardingComplete)
    return (
      <>
        <WindowBar onError={run} />
        <Onboarding state={state} commit={commit} />
      </>
    );
  const view = (
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
            {state.settings.provider === 'ollama'
              ? 'Ваши знания — на устройстве'
              : 'ИИ через выбранный аккаунт'}
          </p>
          <button className="settings-link" onClick={() => setPage('Settings')}>
            <DesignIcon name="imgSettings2" />
            Настройки
          </button>
          <div className="local-status">
            <span
              className={
                ['Local AI ready', 'Аккаунт подключён'].includes(connection) ? 'online' : 'offline'
              }
            />
            <div>
              <strong>
                {providerNames[state.settings.provider].split(' · ')[0]} ·{' '}
                {state.settings.model === 'default' ? 'Авто' : state.settings.model}
              </strong>
              <small>
                {state.settings.provider !== 'ollama'
                  ? connection
                  : connection === 'Local AI ready'
                    ? 'Готова'
                    : connection === 'Model not downloaded'
                      ? 'Модель не загружена'
                      : 'Нет подключения'}{' '}
                · без веб-инструментов
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
          {page === 'Study' && <StudyHub state={state} navigate={setPage} commit={commit} />}
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
              key={topic?.id ?? course?.id ?? 'empty'}
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
              key={tutorKey}
              draft={tutorDraft}
              working={tutorBusy[tutorKey] ?? false}
              setWorking={(busy) => setTutorBusy((requests) => ({ ...requests, [tutorKey]: busy }))}
              readSource={() => {
                const pinned = tutorDraft.pinned;
                if (!pinned) return;
                const source = state.sources.find((s) => s.id === pinned.sourceId);
                if (!source) return;
                setSourcePreview((old) => ({
                  id: source.id,
                  request: old.request + 1,
                  pageIndex: Math.max(
                    0,
                    source.pages.findIndex(
                      (p) => p.page === pinned.page && p.text.includes(pinned.excerpt),
                    ),
                  ),
                }));
                setPage('Library');
              }}
              updateDraft={(next) =>
                setTutorDrafts((drafts) => {
                  // A late request must not clear a newer handoff for this course.
                  if (drafts[tutorKey] && drafts[tutorKey].id !== tutorDraft.id) return drafts;
                  return { ...drafts, [tutorKey]: next };
                })
              }
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
              initialPage={sourcePreview.pageIndex}
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
              setSourcePreview((old) => ({
                id: action.sourceId!,
                request: old.request + 1,
                pageIndex: 0,
              }));
            if (action.page) setPage(action.page);
          }}
        />
      )}
    </div>
  );
  return (
    <SourceTutorBridge
      key={activeId}
      state={state}
      courseId={course?.id}
      createCourse={() => setPage('Courses')}
      start={(destination, pinned) => {
        const key = JSON.stringify([activeId, destination]);
        setTutorDrafts((drafts) => ({
          ...drafts,
          [key]: {
            id: crypto.randomUUID(),
            pinned,
            question:
              'Помоги разобрать этот фрагмент: объясни главную мысль и задай один вопрос для проверки понимания.',
          },
        }));
        setCourseId(destination);
        setPage('AI Tutor');
      }}
    >
      {view}
    </SourceTutorBridge>
  );
}
