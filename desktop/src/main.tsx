import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './styles/workspaces.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ConceptLoom UI error', error, info);
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>We couldn’t open this view.</h1>
        <p>Restart the app to reload your last saved progress.</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
