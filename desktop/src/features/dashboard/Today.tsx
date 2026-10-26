import { PageHeading, Panel } from '../../components/ui';
import { DesignIcon, type DesignIconName } from '../../components/DesignIcon';
import { todayPlan } from '../../learning/planner';
import { DailyGoal } from './Home';
import type { Workspace, Topic } from '../../types/state';
export function Today({
  state,
  learn,
  navigate,
}: {
  state: Workspace;
  learn: (topic: Topic) => void;
  navigate: (page: string) => void;
}) {
  const due = state.cards.filter((c) => new Date(c.due) <= new Date());
  const resume = [...state.sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((s) => s.phase !== 'complete');
  const resumeTopic = state.topics.find((t) => t.id === resume?.topicId);
  const weak = [...state.attempts].reverse().find((a) => !a.accurate);
  const weakTopic = state.topics.find((t) => t.id === weak?.topicId);
  const next = todayPlan(state)[0];
  const steps: {
    title: string;
    detail: string;
    kind: string;
    icon: DesignIconName;
    action: () => void;
  }[] = [];
  if (due.length)
    steps.push({
      title: 'Вернуть в память',
      detail: `${due.length} карточек к повторению · FSRS`,
      kind: 'Повторение',
      icon: 'imgLayers3',
      action: () => navigate('Reviews'),
    });
  if (resumeTopic)
    steps.push({
      title: resumeTopic.title,
      detail: 'Продолжить с сохранённого шага',
      kind: 'Продолжение',
      icon: 'imgNetwork1',
      action: () => learn(resumeTopic),
    });
  if (next && next.topic.id !== resumeTopic?.id)
    steps.push({
      title: next.topic.title,
      detail: next.course.name,
      kind: 'Новая связь',
      icon: 'imgNetwork1',
      action: () => learn(next.topic),
    });
  if (weakTopic && weakTopic.id !== resumeTopic?.id)
    steps.push({
      title: weakTopic.title,
      detail: 'Слабая область · разберите прошлую ошибку',
      kind: 'Практика',
      icon: 'imgGitPullRequest',
      action: () => learn(weakTopic),
    });
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Сегодня — одна новая связь"
        description={`${state.workspaces.find((w) => w.id === state.activeWorkspaceId)?.name} · план построен по вашим ответам`}
        action={
          <button className="secondary" onClick={() => navigate('Settings')}>
            <DesignIcon name="imgSlidersHorizontal" />
            Изменить план
          </button>
        }
      />
      <div className="today-layout">
        <Panel className="adaptive-plan">
          <div className="section-line">
            <div>
              <h2>Ваш план на сегодня</h2>
              <p className="muted small">Сначала вспомнить, затем понять и применить</p>
            </div>
            <span className="status-pill">Адаптивный</span>
          </div>
          <div className="plan-sequence">
            {steps.map((step, i) => (
              <button className="plan-item" key={i} onClick={step.action}>
                <span className="stage-icon">
                  <DesignIcon name={step.icon} />
                </span>
                <span className="plan-copy">
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
                <small>{step.kind}</small>
              </button>
            ))}
            {!steps.length && (
              <div className="plan-empty">
                <h2>Начните с цели и материалов</h2>
                <p className="muted">
                  Добавьте источник и создайте учебное направление. Затем постройте карту понятий.
                </p>
                <div className="button-row">
                  <button className="secondary" onClick={() => navigate('Library')}>
                    Добавить источники
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate(state.courses.length ? 'Knowledge Map' : 'Courses')}
                  >
                    {state.courses.length ? 'Построить маршрут' : 'Создать направление'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="section-line plan-footer">
            <small>Можно остановиться после любого шага</small>
            <button
              className="primary"
              onClick={() => (steps[0] ? steps[0].action() : navigate('Courses'))}
            >
              <DesignIcon name="imgPlay" />
              {steps.length ? 'Начать занятие' : 'Выбрать цель'}
            </button>
          </div>
        </Panel>
        <aside>
          <DailyGoal state={state} />
          <Panel title="Ближайший рубеж">
            <h3>{next?.topic.title ?? 'Первая полезная связь'}</h3>
            <p className="muted small">
              {next?.topic.description ?? 'Ваши ответы помогут найти подходящую точку старта.'}
            </p>
            <span className="status-pill">{state.topics.length} понятий в пространстве</span>
            <hr />
            <button className="text-button" onClick={() => navigate('Roadmap')}>
              Открыть дорожную карту →
            </button>
          </Panel>
        </aside>
      </div>
      <Panel className="resume-evidence">
        <div>
          <h3>На чём остановились</h3>
          <p className="muted small">
            {resumeTopic?.title ?? 'Начните занятие — здесь сохранится точка продолжения.'}
          </p>
        </div>
        <div>
          <small>ПОДТВЕРЖДЕНО ОТВЕТАМИ · НЕ ПРОЧТЕНИЕМ</small>
          <div className="evidence-summary">
            {(['recognition', 'recall', 'application', 'transfer'] as const).map((d, i) => (
              <span key={d}>
                {['Узнавание', 'Воспроизведение', 'Применение', 'Перенос'][i]}{' '}
                {
                  new Set(
                    state.attempts
                      .filter((a) => a.dimension === d && a.accurate)
                      .map((a) => a.topicId),
                  ).size
                }
                /{state.topics.length}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}
