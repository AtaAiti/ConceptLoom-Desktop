import {
  ArrowRight,
  BookOpen,
  Flame,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { PageHeading, Panel, Progress, Empty, ArrowLink } from '../../components/ui';
import { statistics, todayPlan } from '../../learning/planner';
import { topicMastery } from '../../learning/mastery';
import type { Topic, Workspace } from '../../types/state';

export function Dashboard({
  state,
  navigate,
  learn,
}: {
  state: Workspace;
  navigate: (page: string) => void;
  learn: (topic: Topic) => void;
}) {
  const stats = statistics(state);
  const plan = todayPlan(state);
  const hour = new Date().getHours();
  const recent = [
    ...state.attempts.map((a) => ({
      id: a.id,
      at: a.createdAt,
      title: a.accurate ? 'Connection demonstrated' : 'A connection to revisit',
      detail: state.topics.find((t) => t.id === a.topicId)?.title,
    })),
    ...state.reviews.map((r) => ({
      id: r.id,
      at: r.createdAt,
      title: 'Spaced retrieval completed',
      detail: state.cards.find((c) => c.id === r.cardId)?.front,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);
  const maximum = Math.max(1, ...stats.week.map((d) => d.count));
  return (
    <>
      <PageHeading
        eyebrow="YOUR LEARNING SPACE"
        title={`Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}.`}
        description={`Small steps today. Stronger connections tomorrow. Your daily goals: ${state.settings.dailyMinutes} practice minutes · ${state.settings.dailyReviews} reviews.`}
        action={
          <span className="date-chip">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        }
      />
      <div className="hero">
        <div>
          <span className="hero-label">
            <Sparkles size={14} /> ONE CONNECTION AT A TIME
          </span>
          <h2>
            Understanding is built.
            <br />
            <span>Let’s build a little more.</span>
          </h2>
          <p>
            {plan[0]
              ? `Your next connection: ${plan[0].topic.title}`
              : 'Start with a goal. Discover what you know. Find your next connection.'}
          </p>
          <button
            className="primary"
            onClick={() => (plan[0] ? learn(plan[0].topic) : navigate('Courses'))}
          >
            {plan[0] ? 'Continue learning' : 'Create a course'}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="constellation" aria-hidden="true">
          <svg viewBox="0 0 340 210">
            <path d="M45 145L115 92L176 134L246 56L300 108M115 92L100 30M176 134L226 184M246 56L177 25" />
            <circle cx="45" cy="145" r="11" />
            <circle cx="115" cy="92" r="21" />
            <circle cx="176" cy="134" r="14" />
            <circle cx="246" cy="56" r="24" />
            <circle cx="300" cy="108" r="11" />
            <circle cx="100" cy="30" r="7" />
            <circle cx="226" cy="184" r="8" />
            <circle cx="177" cy="25" r="7" />
          </svg>
          <span className="constellation-label">Ideas become understanding.</span>
        </div>
      </div>
      <div className="metrics">
        {[
          {
            icon: Flame,
            label: 'Learning streak',
            value: `${stats.streak}`,
            unit: 'days',
            color: 'orange',
          },
          {
            icon: GitBranch,
            label: 'Concepts learned',
            value: `${stats.learned}`,
            unit: `${stats.mastered} mastered`,
            color: 'purple',
          },
          {
            icon: Layers,
            label: 'Cards due',
            value: `${stats.due}`,
            unit: 'ready for recall',
            color: 'green',
          },
          {
            icon: Target,
            label: 'Practice accuracy',
            value: state.attempts.length ? `${stats.accuracy}%` : '—',
            unit: `${state.attempts.length} attempts`,
            color: 'blue',
          },
        ].map((m) => (
          <div className="metric" key={m.label}>
            <div className={`metric-icon ${m.color}`}>
              <m.icon size={18} />
            </div>
            <span>{m.label}</span>
            <div>
              <strong>{m.value}</strong>
              <small>{m.unit}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div>
          <Panel title="Your courses" subtitle={`${state.courses.length} learning paths`}>
            <div className="course-list">
              {state.courses.map((course) => {
                const topics = state.topics.filter((t) => t.courseId === course.id);
                const progress = topics.length
                  ? Math.round(
                      topics.reduce((sum, t) => sum + topicMastery(state, t.id), 0) / topics.length,
                    )
                  : 0;
                return (
                  <button
                    className="course-row"
                    key={course.id}
                    onClick={() => navigate('Courses')}
                  >
                    <div
                      className={`language-mark ${course.targetLanguage.toLowerCase() === 'korean' ? 'mint' : ''}`}
                    >
                      {course.targetLanguage.toLowerCase() === 'korean' ? (
                        '한'
                      ) : course.targetLanguage.toLowerCase() === 'english' ? (
                        'Aa'
                      ) : (
                        <BookOpen size={22} />
                      )}
                    </div>
                    <div className="course-info">
                      <h3>{course.name}</h3>
                      <p>
                        {course.currentLevel} <span>→</span> {course.targetLevel}
                      </p>
                      <Progress value={progress} />
                    </div>
                    <div className="course-percentage">
                      {progress}%<small>mastery</small>
                    </div>
                  </button>
                );
              })}
              {!state.courses.length && (
                <Empty
                  title="Your first path starts here"
                  description="Create an English, Korean, or custom course."
                />
              )}
            </div>
            <ArrowLink onClick={() => navigate('Courses')}>Manage courses</ArrowLink>
          </Panel>
          <Panel title="Today’s learning plan" subtitle="A little, consistently">
            <div className="plan-row">
              <span className="plan-number">01</span>
              <div>
                <h3>Retrieve what you’ve learned</h3>
                <p>
                  {stats.due
                    ? `${stats.due} cards are ready for a fresh recall.`
                    : 'Your future reviews will appear here.'}
                </p>
              </div>
              <button className="secondary compact" onClick={() => navigate('Reviews')}>
                Review <ArrowRight size={14} />
              </button>
            </div>
            {plan.slice(0, 2).map((item, i) => (
              <div className="plan-row" key={item.topic.id}>
                <span className="plan-number">0{i + 2}</span>
                <div>
                  <h3>{item.topic.title}</h3>
                  <p>{item.course.name} · Your knowledge frontier</p>
                </div>
                <button className="secondary compact" onClick={() => learn(item.topic)}>
                  Learn <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </Panel>
        </div>
        <div>
          <Panel title="This week" subtitle="Retrieval activity">
            <div className="week-chart">
              {stats.week.map((day) => (
                <div key={day.key}>
                  <span>{day.count || ''}</span>
                  <div
                    className={`bar ${day.key === stats.week[6].key ? 'today' : ''}`}
                    style={{ height: Math.max(3, (day.count / maximum) * 105) }}
                  />
                  <small>{day.label}</small>
                </div>
              ))}
            </div>
            <div className="chart-footer">
              <strong>{stats.week.reduce((sum, d) => sum + d.count, 0)}</strong>
              <span>learning & review attempts this week</span>
            </div>
          </Panel>
          <Panel title="Recent connections">
            <div className="activity-list">
              {recent.length ? (
                recent.map((item) => (
                  <div className="activity" key={item.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                      <small>{new Date(item.at).toLocaleDateString()}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Your real learning activity will appear after your first checkpoint.
                </p>
              )}
            </div>
          </Panel>
          <div className="privacy-note">
            <ShieldCheck size={18} />
            <p>
              Your learning data stays
              <br />
              on your computer.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
