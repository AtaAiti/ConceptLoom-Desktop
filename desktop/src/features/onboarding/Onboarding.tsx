import { useState } from 'react';
import { ArrowRight, Check, Cpu, GitBranch, ShieldCheck, Sparkles } from 'lucide-react';
import { OllamaProvider } from '../../ai/providers/ollama';
import { CourseForm } from '../courses/CourseForm';
import type { Commit } from '../../hooks/useWorkspace';
import type { Workspace } from '../../types/state';
import { errorMessage } from '../../components/ui';

export function Onboarding({ state, commit }: { state: Workspace; commit: Commit }) {
  const [step, setStep] = useState(0);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [model, setModel] = useState(state.settings.model);
  const [choice, setChoice] = useState('Custom');
  const next = () => setStep((s) => s + 1);
  return (
    <main className="onboarding">
      <div className="onboarding-brand">
        <GitBranch size={28} /> ConceptLoom <span>DESKTOP</span>
      </div>
      <div className="onboarding-card">
        <div className="step-dots">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i <= step ? 'active' : ''} />
          ))}
        </div>
        {step === 0 && (
          <>
            <div className="welcome-icon">
              <Sparkles size={36} />
            </div>
            <div className="eyebrow">LEARNING THAT CONNECTS</div>
            <h1>
              A little understanding.
              <br />A world of possibility.
            </h1>
            <p>
              Welcome to ConceptLoom Desktop.
              <br />
              Your learning environment with a choice of AI providers.
            </p>
            <div className="welcome-features">
              <span>
                <GitBranch />
                Build connected knowledge
              </span>
              <span>
                <Cpu />
                Learn with your chosen AI
              </span>
              <span>
                <ShieldCheck />
                Progress saved on your computer
              </span>
            </div>
            <button className="primary" onClick={next}>
              Make your first connection <ArrowRight size={17} />
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="eyebrow">02 / LOCAL AI</div>
            <h1>Meet your local tutor.</h1>
            <p>ConceptLoom connects to Ollama on your computer.</p>
            <div className="connection-box">
              <Cpu />
              <div>
                <strong>Ollama</strong>
                <p>{state.settings.endpoint}</p>
              </div>
            </div>
            <button
              className="primary"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                try {
                  const available = await new OllamaProvider(
                    state.settings.endpoint,
                    model,
                  ).models();
                  setModels(available);
                  setStatus(
                    available.length
                      ? `Connected · ${available.length} local model(s)`
                      : 'Ollama is running. Download a model with ollama pull qwen3:4b.',
                  );
                } catch (e) {
                  setStatus(errorMessage(e));
                } finally {
                  setWorking(false);
                }
              }}
            >
              {working ? 'Checking…' : 'Check Ollama'}
            </button>
            {status && <p role="status">{status}</p>}
            <button className="secondary" onClick={next}>
              Continue <ArrowRight size={16} />
            </button>
            <p className="muted small">
              You can continue without Ollama. Connect ChatGPT, Claude or Gemini through your
              account in Settings after setup.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <div className="eyebrow">03 / YOUR MODEL</div>
            <h1>Small model. Big ideas.</h1>
            <p>
              qwen3:4b is the default for your 16 GB computer. Speed depends on your local hardware.
            </p>
            <label className="field">
              <span>Local model</span>
              <input
                list="onboarding-models"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <datalist id="onboarding-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <div className="hint">
              Not downloaded yet? Run <code>ollama pull qwen3:4b</code> in PowerShell.
            </div>
            <button
              className="primary"
              disabled={working || !model.trim()}
              onClick={async () => {
                setWorking(true);
                try {
                  await commit((s) => ({ ...s, settings: { ...s.settings, model: model.trim() } }));
                  next();
                } catch (e) {
                  setStatus(errorMessage(e));
                } finally {
                  setWorking(false);
                }
              }}
            >
              Use this model <Check size={16} />
            </button>
            {status && <p role="status">{status}</p>}
          </>
        )}
        {step === 3 && (
          <>
            <div className="eyebrow">04 / FIRST COURSE</div>
            <h1>What opens your next door?</h1>
            <p>Study any subject with your own materials. Languages are one option.</p>
            <div className="course-choices">
              {['Custom', 'English', 'Korean'].map((n) => (
                <button
                  key={n}
                  className={choice === n ? 'chosen' : ''}
                  onClick={() => setChoice(n)}
                >
                  <strong>{n === 'English' ? 'Aa' : n === 'Korean' ? '한' : '✦'}</strong>
                  {n}
                </button>
              ))}
            </div>
            <button className="primary" onClick={next}>
              Set your learning goal <ArrowRight size={16} />
            </button>
            <button
              className="secondary"
              onClick={() => {
                void commit((s) => ({
                  ...s,
                  settings: { ...s.settings, onboardingComplete: true },
                })).catch((e) => setStatus(errorMessage(e)));
              }}
            >
              Start with an empty workspace
            </button>
            {status && <p role="status">{status}</p>}
          </>
        )}
        {step === 4 && (
          <>
            <div className="eyebrow">05 / YOUR DESTINATION</div>
            <h1>Give your curiosity a direction.</h1>
            <p>Choose a useful outcome. We’ll find the path together.</p>
            {state.courses.length ? (
              <>
                <p>Your first course has been saved.</p>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await commit((s) => ({
                        ...s,
                        settings: { ...s.settings, onboardingComplete: true },
                      }));
                    } catch (e) {
                      setStatus(errorMessage(e));
                    }
                  }}
                >
                  Open Dashboard
                </button>
              </>
            ) : (
              <CourseForm
                defaultLanguage={state.settings.explanationLanguage}
                commit={commit}
                initialName={choice === 'Custom' ? 'My course' : choice}
                onDone={async () => {
                  try {
                    await commit((s) => ({
                      ...s,
                      settings: { ...s.settings, onboardingComplete: true },
                    }));
                  } catch (e) {
                    setStatus(errorMessage(e));
                  }
                }}
              />
            )}{' '}
            {status && <p role="status">{status}</p>}
          </>
        )}
        {step > 0 && (
          <button className="text-button back" onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
        )}
      </div>
      <p className="onboarding-foot">
        Ollama works offline. Account providers are optional and available in Settings.
      </p>
    </main>
  );
}
