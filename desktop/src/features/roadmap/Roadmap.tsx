import { PageHeading, Panel, Empty, Progress } from '../../components/ui';
import { DesignIcon } from '../../components/DesignIcon';
import { topicStatus } from '../../learning/conceptloom';
import { topicMastery } from '../../learning/mastery';
import { Citations } from '../library/SourceContext';
import type { Course, Topic, Workspace } from '../../types/state';
export function Roadmap({
  state,
  course,
  learn,
  edit,
}: {
  state: Workspace;
  course?: Course;
  learn: (topic: Topic) => void;
  edit: () => void;
}) {
  if (!course)
    return (
      <Empty
        title="Выберите цель"
        description="Создайте учебное направление, чтобы построить дорожную карту."
      />
    );
  const remaining = state.topics.filter((t) => t.courseId === course.id);
  const ordered: Topic[] = [];
  while (remaining.length) {
    const index = remaining.findIndex((t) =>
      t.dependsOn.every((id) => ordered.some((p) => p.id === id)),
    );
    if (index < 0) break;
    ordered.push(...remaining.splice(index, 1));
  }
  const next = ordered.find(
    (t) => topicStatus(state, t) === 'available' || topicStatus(state, t) === 'learning',
  );
  const mastered = ordered.filter((t) => topicMastery(state, t.id) >= 81).length;
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Дорожная карта"
        description="Что изучать дальше — и какое действие подтвердит понимание"
        action={
          <button className="secondary" onClick={edit}>
            Изменить маршрут
          </button>
        }
      />
      <div className="roadmap-goal">
        <DesignIcon name="imgFlag" />
        <div>
          <h2>{course.goal || course.name}</h2>
          <p>
            {course.name} · {course.description}
          </p>
        </div>
        <div>
          <small>
            {mastered} из {ordered.length} понятий подтверждены
          </small>
          <Progress value={ordered.length ? (mastered / ordered.length) * 100 : 0} />
        </div>
        {course.targetDate && (
          <span className="status-pill">
            {new Date(course.targetDate).toLocaleDateString('ru-RU')}
          </span>
        )}
      </div>
      {!ordered.length ? (
        <Empty
          title="Постройте короткий полезный маршрут"
          description="Добавьте понятия или запросите план по выбранным источникам."
        >
          <button className="primary" onClick={edit}>
            Построить маршрут
          </button>
        </Empty>
      ) : (
        <div className="roadmap-layout">
          <div className="roadmap-list">
            {ordered.map((topic, index) => {
              const status = topicStatus(state, topic);
              return (
                <Panel
                  className={`roadmap-node ${status}`}
                  key={topic.id}
                  title={`${index + 1}. ${topic.title}`}
                  subtitle={
                    {
                      available: 'Следующая связь',
                      learning: 'Изучаем',
                      mastered: 'Освоено',
                      reviewing: 'Повторение',
                      locked: 'После предпосылок',
                    }[status]
                  }
                >
                  <p>{topic.description}</p>
                  {status !== 'locked' && (
                    <>
                      <Progress value={topicMastery(state, topic.id)} />
                      <p className="small">
                        {topicMastery(state, topic.id)}% · подтверждено ответами
                      </p>
                      <Citations citations={topic.citations} />
                      <button className="primary compact" onClick={() => learn(topic)}>
                        <DesignIcon name="imgArrowRight" />
                        {state.lessons.some((l) => l.topicId === topic.id)
                          ? 'Продолжить практику'
                          : 'Открыть занятие'}
                      </button>
                    </>
                  )}
                  {status === 'locked' && (
                    <small>
                      Сначала:{' '}
                      {topic.dependsOn
                        .map((id) => ordered.find((t) => t.id === id)?.title)
                        .join(', ')}
                    </small>
                  )}
                </Panel>
              );
            })}
          </div>
          <aside>
            <Panel title="Граница знаний">
              <small>Уже можете</small>
              <p className="accent">
                {ordered
                  .filter((t) => topicMastery(state, t.id) >= 61)
                  .map((t) => t.title)
                  .slice(-2)
                  .join(' · ') || 'Первые ответы помогут определить точку старта.'}
              </p>
              <hr />
              <small>Следующая связь</small>
              <h3>{next?.title ?? 'Повторите изученные понятия'}</h3>
              <p className="muted small">{next?.description}</p>
            </Panel>
            <Panel title="Подтвердить понимание">
              <p className="muted small">
                Объясните идею своими словами, примените её и попробуйте перенести в новую задачу.
              </p>
              <hr />
              <small>Чтение материалов не меняет прогресс. Нужны ответы и применение.</small>
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
