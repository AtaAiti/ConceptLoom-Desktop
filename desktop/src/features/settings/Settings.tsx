import { useEffect, useState } from 'react';
import { Cpu, ShieldCheck } from 'lucide-react';
import { errorMessage, Field, PageHeading, Panel } from '../../components/ui';
import { repository } from '../../db/repository';
import { OllamaProvider, localEndpoint } from '../../ai/providers/ollama';
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
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [location, setLocation] = useState('Loading data location…');
  useEffect(() => {
    repository
      .location()
      .then(setLocation)
      .catch((e) => {
        console.error(e);
        setLocation('Data location unavailable.');
      });
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="MAKE IT YOURS / SETTINGS"
        title="Your space. Your pace."
        description="Everything you need, running on your own computer."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            localEndpoint(settings.endpoint);
            await commit((s) => ({ ...s, settings }));
            setStatus('Settings saved.');
          });
        }}
      >
        <Panel title="Local intelligence" subtitle="OLLAMA">
          <div className="form-grid">
            <Field label="AI provider">
              <select value={settings.provider} disabled>
                <option value="ollama">Ollama · local</option>
              </select>
            </Field>
            <Field label="Ollama URL">
              <input
                required
                value={settings.endpoint}
                onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
              />
            </Field>
            <Field label="AI model">
              <input
                required
                list="available-models"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              />
              <datalist id="available-models">
                {models.map((model) => (
                  <option value={model} key={model} />
                ))}
              </datalist>
            </Field>
            <div className="field">
              <span>Connection & model discovery</span>
              <button
                type="button"
                className="secondary"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  try {
                    const models = await new OllamaProvider(
                      settings.endpoint,
                      settings.model,
                    ).models();
                    setModels(models);
                    setStatus(
                      models.includes(settings.model)
                        ? `Connected · ${models.length} models · ${settings.model} is ready`
                        : `Ollama connected. Model '${settings.model}' is not downloaded. Run ollama pull ${settings.model}.`,
                    );
                  } catch (e) {
                    setStatus(errorMessage(e));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                <Cpu size={16} />
                {working ? 'Checking…' : 'Test AI connection'}
              </button>
            </div>
          </div>
          <p className="muted small">
            Recommended model: qwen3:4b. Download models in Ollama. The model list updates when you
            test the connection.
          </p>
        </Panel>
        <Panel title="Learning preferences">
          <div className="form-grid">
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
        <Panel title="Private by design">
          <div className="privacy-settings">
            <ShieldCheck size={28} />
            <div>
              <h3>Your learning data stays on your computer.</h3>
              <p className="muted">
                No telemetry, account, paid API, or cloud backend. Local AI requests are restricted
                to loopback addresses.
              </p>
              <span className="eyebrow">DATA LOCATION</span>
              <p className="data-path">{location}</p>
            </div>
          </div>
        </Panel>
        <div className="button-row">
          <button className="primary">Save settings</button>
          <span role="status" className="muted">
            {status}
          </span>
        </div>
      </form>
    </>
  );
}
