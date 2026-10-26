import { useEffect, useState } from 'react';
import { Cpu, ShieldCheck } from 'lucide-react';
import { errorMessage, Field, PageHeading, Panel } from '../../components/ui';
import { repository } from '../../db/repository';
import { mergeSettings } from '../../db/settings';
import { OllamaProvider, localEndpoint } from '../../ai/providers/ollama';
import {
  accountStatus,
  accountSetup,
  testAccount,
  providerNames,
  modelPresets,
  switchProvider,
  type AccountStatus,
  type ProviderId,
} from '../../ai/providers/accounts';
import type { Commit } from '../../hooks/useWorkspace';
import type { Workspace } from '../../types/state';

export function Settings({
  state,
  commit,
  run,
}: {
  state: Workspace;
  commit: Commit;
  run: (task: () => Promise<void>) => void;
}) {
  const [settings, setSettings] = useState({ ...state.settings });
  const [baseline, setBaseline] = useState(state.settings);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [account, setAccount] = useState<AccountStatus>();
  const [accountIssue, setAccountIssue] = useState('');
  const [location, setLocation] = useState('Загружается…');
  const cloud = settings.provider !== 'ollama';
  useEffect(() => {
    repository
      .location()
      .then(setLocation)
      .catch(() => setLocation('Папка данных недоступна.'));
  }, []);
  useEffect(() => {
    let active = true;
    setAccount(undefined);
    setAccountIssue('');
    setStatus('');
    if (settings.provider !== 'ollama') {
      void accountStatus(settings.provider)
        .then((result) => {
          if (active) setAccount(result);
        })
        .catch((e) => {
          if (active) setAccountIssue(errorMessage(e));
        });
    }
    return () => {
      active = false;
    };
  }, [settings.provider]);
  const perform = async (task: () => Promise<string>) => {
    setWorking(true);
    setStatus('');
    try {
      setStatus(await task());
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="НАСТРОЙКИ"
        title="Ваш ИИ. Ваш темп."
        description="Локальная модель или официальный клиент с входом в ваш аккаунт."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            localEndpoint(settings.endpoint);
            if (
              cloud &&
              (!/^[a-zA-Z0-9._:/-]{1,200}$/.test(settings.model) || settings.model.startsWith('-'))
            )
              throw new Error('Укажите корректное имя модели или default.');
            let saved = {
              ...settings,
              providerModels: { ...settings.providerModels, [settings.provider]: settings.model },
            };
            await commit((s) => {
              saved = mergeSettings(s.settings, baseline, saved);
              return { ...s, settings: saved };
            });
            setSettings(saved);
            setBaseline(saved);
            setStatus(
              cloud && !saved.accountDataConsent
                ? 'Настройки сохранены. Передача учебного контекста отключена.'
                : 'Настройки сохранены.',
            );
          });
        }}
      >
        <Panel
          title="Искусственный интеллект"
          subtitle={cloud ? 'ВХОД ЧЕРЕЗ АККАУНТ' : 'НА ВАШЕМ УСТРОЙСТВЕ'}
        >
          <div className="form-grid">
            <Field label="AI provider">
              <select
                disabled={working}
                value={settings.provider}
                onChange={(e) => {
                  setSettings(switchProvider(settings, e.target.value as ProviderId));
                  setModels([]);
                }}
              >
                {Object.entries(providerNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            {!cloud && (
              <Field label="Ollama URL">
                <input
                  required
                  value={settings.endpoint}
                  onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
                />
              </Field>
            )}
            <Field label="AI model">
              <input
                required
                maxLength={200}
                disabled={working}
                list="available-models"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              />
              <datalist id="available-models">
                {(settings.provider === 'ollama' ? models : modelPresets[settings.provider]).map(
                  (model) => (
                    <option value={model} key={model}>
                      {model === 'default' ? 'Автоматически — модель выбирает клиент' : model}
                    </option>
                  ),
                )}
              </datalist>
              {cloud && (
                <small className="muted">
                  default — выбор клиента. Можно указать ID модели, доступной вашему аккаунту.
                </small>
              )}
            </Field>
            {!cloud && (
              <div className="field">
                <span>Подключение и список моделей</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={working}
                  onClick={() =>
                    void perform(async () => {
                      const available = await new OllamaProvider(
                        settings.endpoint,
                        settings.model,
                      ).models();
                      setModels(available);
                      return available.includes(settings.model)
                        ? `Connected · ${available.length} models · ${settings.model} is ready`
                        : `Ollama работает. Загрузите модель: ollama pull ${settings.model}`;
                    })
                  }
                >
                  <Cpu size={16} />
                  {working ? 'Проверка…' : 'Test AI connection'}
                </button>
              </div>
            )}
          </div>
          {cloud ? (
            <div className="account-connection">
              <p className="muted">
                {settings.provider === 'codex'
                  ? 'Войдите в ChatGPT через Codex.'
                  : settings.provider === 'claude'
                    ? 'Войдите в Claude через Claude Code, выбрав аккаунт с подпиской.'
                    : 'В Gemini CLI выберите Login with Google.'}{' '}
                Доступ к моделям и лимиты определяет сервис. API-ключ не нужен.
              </p>
              <div className="account-status" role="status">
                <strong>{account?.version || 'Официальный клиент'}</strong>
                <span>{accountIssue || account?.message || 'Проверяется наличие клиента…'}</span>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={working}
                  onClick={() =>
                    void perform(async () => {
                      if (settings.provider === 'ollama') return '';
                      const message = await accountSetup(settings.provider, 'install');
                      setAccount(await accountStatus(settings.provider));
                      return message;
                    })
                  }
                >
                  Установить / обновить клиент
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={working || !account?.compatible}
                  onClick={() =>
                    void perform(() =>
                      settings.provider === 'ollama'
                        ? Promise.resolve('')
                        : accountSetup(settings.provider, 'login'),
                    )
                  }
                >
                  Войти в аккаунт
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={working}
                  onClick={() =>
                    void perform(async () => {
                      if (settings.provider === 'ollama') return '';
                      const result = await accountStatus(settings.provider);
                      setAccount(result);
                      return result.message;
                    })
                  }
                >
                  Обновить статус
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={working || !account?.compatible}
                  onClick={() =>
                    void perform(() =>
                      settings.provider === 'ollama'
                        ? Promise.resolve('')
                        : testAccount(settings.provider, settings.model),
                    )
                  }
                >
                  Проверить ответ
                </button>
              </div>
              {working && (
                <p role="status" className="muted">
                  Выполняется… Установка клиента и первый запрос могут занять несколько минут.
                </p>
              )}
              <p className="muted small">
                Для установки нужен Node.js 22+. Вход откроется в отдельном окне официального
                клиента. «Проверить ответ» отправляет короткий тест без ваших материалов и
                использует лимит аккаунта.
              </p>
              <label className="account-consent">
                <input
                  type="checkbox"
                  checked={settings.accountDataConsent}
                  onChange={(e) =>
                    setSettings({ ...settings, accountDataConsent: e.target.checked })
                  }
                />
                <span>
                  Разрешаю отправлять учебные запросы, ответы и выбранные фрагменты источников в{' '}
                  {providerNames[settings.provider].split(' · ')[0]} для работы ИИ.
                </span>
              </label>
            </div>
          ) : (
            <p className="muted small">
              Список локальных моделей обновляется при проверке подключения. Облачные аккаунты можно
              выбрать в поле AI provider.
            </p>
          )}
        </Panel>
        <Panel title="Учебные предпочтения">
          <div className="form-grid">
            <Field label="Reduced motion">
              <input
                type="checkbox"
                checked={settings.reducedMotion ?? false}
                onChange={(e) => setSettings({ ...settings, reducedMotion: e.target.checked })}
              />
            </Field>
            <Field label="Theme">
              <select
                value={settings.theme}
                onChange={(e) =>
                  setSettings({ ...settings, theme: e.target.value as 'dark' | 'light' })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </Field>
            <Field label="Default explanation language">
              <input
                required
                value={settings.explanationLanguage}
                onChange={(e) => setSettings({ ...settings, explanationLanguage: e.target.value })}
              />
            </Field>
            <Field label="Daily learning goal (minutes)">
              <input
                type="number"
                min={1}
                max={240}
                required
                value={settings.dailyMinutes}
                onChange={(e) => setSettings({ ...settings, dailyMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Daily review goal (cards)">
              <input
                type="number"
                min={1}
                max={500}
                required
                value={settings.dailyReviews}
                onChange={(e) => setSettings({ ...settings, dailyReviews: Number(e.target.value) })}
              />
            </Field>
          </div>
        </Panel>
        <Panel title="Хранение данных">
          <div className="privacy-settings">
            <ShieldCheck size={28} />
            <div>
              <h3>Источники и прогресс сохраняются на компьютере.</h3>
              <p className="muted">
                Ollama обрабатывает запросы локально. При выборе аккаунта учебный контекст
                передаётся этому сервису. Приложение использует сохранённый вход официального
                клиента; пароли и токены в базу приложения не копируются. Клиенты могут сохранять
                собственную историю по правилам сервиса.
              </p>
              <span className="eyebrow">ПАПКА ДАННЫХ</span>
              <p className="data-path">{location}</p>
            </div>
          </div>
        </Panel>
        <div className="button-row">
          <button className="primary" disabled={working}>
            {working ? 'Подождите…' : 'Save settings'}
          </button>
          <span role="status" className="muted">
            {status}
          </span>
        </div>
      </form>
    </>
  );
}
