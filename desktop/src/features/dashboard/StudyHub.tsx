import { PageHeading, Panel } from '../../components/ui';
import { DesignIcon, type DesignIconName } from '../../components/DesignIcon';
import type { Workspace } from '../../types/state';
export function StudyHub({
  state,
  navigate,
}: {
  state: Workspace;
  navigate: (page: string) => void;
}) {
  const due = state.cards.filter((c) => new Date(c.due) <= new Date()).length;
  const modes: { page: string; title: string; detail: string; icon: DesignIconName }[] = [
    {
      page: 'Reviews',
      title: 'Карточки · FSRS',
      detail: `${due} ждут. Вспомнить ответ и выбрать интервал следующего повторения.`,
      icon: 'imgLayers3',
    },
    {
      page: 'Learn',
      title: 'Проверка знаний',
      detail: 'Воспроизведение, применение и перенос. Обратная связь после каждого ответа.',
      icon: 'imgListChecks',
    },
    {
      page: 'Flashcards',
      title: 'Мои карточки',
      detail: `${state.cards.length} карточек. Создание, редактирование и ссылки на источники.`,
      icon: 'imgBrain',
    },
    {
      page: 'AI Tutor',
      title: 'Разобрать связь',
      detail: 'Объяснить своими словами и задать вопрос локальному репетитору.',
      icon: 'imgSparkles',
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow=""
        title="Учебный центр"
        description="Выберите действие, которое превратит знакомое в применимое"
      />
      <div className="study-context">
        <DesignIcon name="imgNetwork1" />
        <span>
          {state.topics.length} понятий · {state.sources.length} источников
        </span>
        <button className="text-button" onClick={() => navigate('Courses')}>
          Учебные направления →
        </button>
      </div>
      <div className="today-layout">
        <div>
          <Panel className="resume-card">
            <div className="section-line">
              <h2>Адаптивное обучение</h2>
              <span className="accent small">Рекомендуем</span>
            </div>
            <div className="section-line">
              <p className="muted small">
                Повторение → новая связь → применение.
                <br />
                План с учётом ваших ответов.
              </p>
              <button className="primary" onClick={() => navigate('Today')}>
                <DesignIcon name="imgPlay" />
                Начать
              </button>
            </div>
          </Panel>
          <div className="study-modes">
            {modes.map((m) => (
              <button key={m.page} className="study-mode" onClick={() => navigate(m.page)}>
                <h3>
                  <DesignIcon name={m.icon} />
                  {m.title}
                </h3>
                <p>{m.detail}</p>
              </button>
            ))}
          </div>
          <button className="study-mode full" onClick={() => navigate('Knowledge Map')}>
            <h3>
              <DesignIcon name="imgNetwork" />
              Найти следующую связь
            </h3>
            <p>Откройте карту, выберите понятие и проверьте понимание.</p>
          </button>
        </div>
        <aside>
          <Panel title="Стоит повторить">
            <div className="section-line">
              <span>Карточки к повторению</span>
              <strong className="accent">{due}</strong>
            </div>
            <hr />
            <h3>Слабые связи</h3>
            {[...new Set(state.attempts.filter((a) => !a.accurate).map((a) => a.topicId))]
              .slice(-3)
              .map((id) => (
                <p className="muted small" key={id}>
                  {state.topics.find((t) => t.id === id)?.title}
                </p>
              ))}
            <button className="text-button" onClick={() => navigate('Weak Areas')}>
              Посмотреть результаты →
            </button>
          </Panel>
          <Panel title="Ваши материалы">
            <p className="muted small">
              Выберите источники, на которых будут основаны объяснения и проверки.
            </p>
            <button className="secondary" onClick={() => navigate('Library')}>
              Открыть источники
            </button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
