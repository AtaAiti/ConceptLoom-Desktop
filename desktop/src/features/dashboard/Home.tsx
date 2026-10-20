import { PageHeading, Panel, Progress } from '../../components/ui';
import { DesignIcon } from '../../components/DesignIcon';
import { dayKey, statistics } from '../../learning/planner';
import { topicMastery } from '../../learning/mastery';
import type { Workspace } from '../../types/state';

export function DailyGoal({ state }: { state: Workspace }) {
  const minutes = Math.round(
    state.attempts
      .filter((a) => dayKey(a.createdAt) === dayKey(new Date()))
      .reduce((sum, a) => sum + a.elapsedSeconds, 0) / 60,
  );
  return (
    <Panel
      className="daily-goal"
      title="Дневная цель"
      subtitle={`${statistics(state).streak} дн. подряд`}
    >
      <div className="goal-value">
        <strong>
          {minutes} / {state.settings.dailyMinutes}
        </strong>
        <span>мин практики</span>
      </div>
      <Progress value={Math.min(100, (minutes / state.settings.dailyMinutes) * 100)} />
      <p className="muted small">
        {minutes >= state.settings.dailyMinutes
          ? 'Дневная цель достигнута.'
          : `Осталось ${state.settings.dailyMinutes - minutes} мин.`}{' '}
        Считаем практику, а не время открытой страницы.
      </p>
    </Panel>
  );
}
export function Home({
  state,
  navigate,
  open,
}: {
  state: Workspace;
  navigate: (page: string) => void;
  open: (id: string) => void;
}) {
  const spaces = state.workspaces
    .filter((w) => !w.archived)
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastOpenedAt.localeCompare(a.lastOpenedAt),
    );
  const last = [...state.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const topic = state.topics.find((t) => t.id === last?.topicId);
  const events = [
    ...state.attempts.map((a) => ({
      id: a.id,
      date: a.createdAt,
      title: state.topics.find((t) => t.id === a.topicId)?.title ?? 'Практика',
      detail: a.accurate ? 'Понимание подтверждено' : 'Найдена связь для практики',
      icon: 'imgCircleCheck' as const,
    })),
    ...state.sources.map((s) => ({
      id: s.id,
      date: s.importedAt,
      title: s.title,
      detail: 'Добавлен источник',
      icon: 'imgFilePlus2' as const,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2);
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Хороший день для новой связи"
        description={`${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} · ваши пространства и следующий шаг в каждом`}
        action={
          <button className="secondary" onClick={() => navigate('Workspaces')}>
            <DesignIcon name="imgPlus" />
            Новое пространство
          </button>
        }
      />
      <div className="home-overview">
        <Panel className="resume-card">
          <div className="section-line">
            <span className="status-pill">
              {topic ? 'ПРОДОЛЖИТЬ ОБУЧЕНИЕ' : 'НАЧНИТЕ С ЛЮБОПЫТСТВА'}
            </span>
            <span className="muted small">
              {last ? new Date(last.updatedAt).toLocaleDateString('ru-RU') : 'Ваш следующий шаг'}
            </span>
          </div>
          <h2>{topic?.title ?? 'От первого вопроса к новым связям'}</h2>
          <div className="section-line">
            <p className="muted">
              {topic?.description ??
                'Добавьте свои материалы и выберите, что хотите понять. Источники и прогресс сохраняются на устройстве.'}
            </p>
            <button
              className="primary"
              onClick={() => {
                const workspaceId = state.courses.find(
                  (c) => c.id === topic?.courseId,
                )?.workspaceId;
                if (workspaceId && spaces.some((w) => w.id === workspaceId)) open(workspaceId);
                else navigate('Today');
              }}
            >
              <DesignIcon name="imgArrowRight" />К плану на сегодня
            </button>
          </div>
        </Panel>
        <DailyGoal state={state} />
      </div>
      <div className="section-line">
        <h2>Ваши пространства</h2>
        <button className="text-button" onClick={() => navigate('Workspaces')}>
          {spaces.length} пространств · управление →
        </button>
      </div>
      <div className="home-spaces">
        {spaces.map((w) => {
          const ids = new Set(state.courses.filter((c) => c.workspaceId === w.id).map((c) => c.id));
          const topics = state.topics.filter((t) => ids.has(t.courseId));
          const mastered = topics.filter((t) => topicMastery(state, t.id) >= 81).length;
          const due = state.cards.filter(
            (c) => ids.has(c.courseId) && new Date(c.due) <= new Date(),
          ).length;
          return (
            <button key={w.id} className="workspace-card" onClick={() => open(w.id)}>
              <div className="section-line">
                <DesignIcon name="imgDatabase" />
                <h3>{w.name}</h3>
                <DesignIcon name="imgArrowUpRight" />
              </div>
              <p>{w.goal || w.description || 'Материалы, связи и практика'}</p>
              <Progress value={topics.length ? (mastered / topics.length) * 100 : 0} />
              <small>
                {mastered} из {topics.length} понятий подтверждены
              </small>
              <span className="status-pill">
                {due ? `${due} к повторению` : 'Следующий шаг готов'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="home-overview">
        <Panel title="Последняя активность" subtitle="На этом устройстве">
          {events.length ? (
            events.map((e) => (
              <div className="activity-row" key={e.id}>
                <DesignIcon name={e.icon} />
                <span>
                  {e.detail}: {e.title}
                </span>
                <small>{new Date(e.date).toLocaleDateString('ru-RU')}</small>
              </div>
            ))
          ) : (
            <p className="muted">
              Здесь появятся добавленные источники и результаты вашей практики.
            </p>
          )}
          <button className="text-button" onClick={() => navigate('Statistics')}>
            Статистика текущего пространства →
          </button>
        </Panel>
        <Panel title="Только ваше пространство">
          <p className="muted small">
            Источники и прогресс хранятся локально.{' '}
            {state.settings.provider === 'ollama'
              ? 'Ollama работает без аккаунта и подписки.'
              : 'Учебные запросы отправляются выбранному ИИ через ваш аккаунт.'}
          </p>
          <p className="accent small">Бесплатно · работает без интернета</p>
        </Panel>
      </div>
    </>
  );
}
