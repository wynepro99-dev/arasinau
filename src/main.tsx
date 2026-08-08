import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error reporter to show runtime errors on screen (instead of a silent white screen)
if (typeof window !== 'undefined') {
  const showErrorOverlay = (title: string, message: string, stack?: string) => {
    try {
      // Avoid double overlays
      if (document.getElementById('critical-error-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'critical-error-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.backgroundColor = '#1e1b4b'; // Deep indigo background
      overlay.style.color = '#fda4af'; // Rose text
      overlay.style.padding = '2rem';
      overlay.style.zIndex = '9999999';
      overlay.style.overflow = 'auto';
      overlay.style.fontFamily = 'monospace';

      overlay.innerHTML = `
        <div style="max-w-2xl mx-auto space-y-4">
          <h1 style="color: #ef4444; font-size: 1.5rem; font-weight: bold; border-bottom: 2px solid #ef4444; padding-bottom: 0.5rem;">
            ❌ CRITICAL RUNTIME ERROR
          </h1>
          <p style="font-weight: bold; font-size: 1.1rem; color: #ffffff;">${title}</p>
          <div style="background-color: #0f172a; padding: 1rem; border-radius: 0.5rem; border: 1px solid #334155; overflow-x: auto;">
            <pre style="margin: 0; color: #38bdf8; white-space: pre-wrap;">${message}</pre>
          </div>
          ${stack ? `
            <h2 style="font-size: 1rem; font-weight: bold; color: #e2e8f0; margin-top: 1rem;">Stack Trace:</h2>
            <div style="background-color: #0f172a; padding: 1rem; border-radius: 0.5rem; border: 1px solid #334155; overflow-x: auto; max-height: 200px; font-size: 0.8rem;">
              <pre style="margin: 0; color: #94a3b8; white-space: pre-wrap;">${stack}</pre>
            </div>
          ` : ''}
          <div style="padding-top: 1rem;">
            <button onclick="location.reload(true)" style="background-color: #ef4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; font-weight: bold; cursor: pointer;">
              Force Reload Page
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    } catch (e) {
      console.error('Failed to show error overlay:', e);
    }
  };

  window.onerror = (message, source, lineno, colno, error) => {
    // Ignore generic cross-origin script errors (often caused by browser extensions or translation scripts)
    const msgStr = String(message);
    if (msgStr === 'Script error.' || msgStr.includes('Script error') || !source) {
      console.warn('Ignored cross-origin script error:', message);
      return false;
    }

    showErrorOverlay(
      `Unhandled Exception: ${msgStr}`,
      `Source: ${source}:${lineno}:${colno}`,
      error?.stack
    );
    return false;
  };

  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    showErrorOverlay(
      `Unhandled Promise Rejection`,
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined
    );
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
