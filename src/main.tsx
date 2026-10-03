import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/lab.css';
import './styles/keys.css';
import './styles/monsters.css';
import './styles/overlays.css';
import './styles/blocks.css';
import './styles/paint.css';
import './styles/songs.css';
import './styles/parent.css';
import './styles/learn.css';
import { App } from './ui/App';
import { flushSave } from './store/persistence';
import * as actions from './store/actions';
import { getState, setState } from './store/store';
import { studio } from './studio/studio';
import * as bus from './studio/visualBus';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Never lose work: write immediately when the app is hidden or closed.
window.addEventListener('pagehide', () => void flushSave());

// Offline support when installed as an app. Skipped inside embedded previews.
// (VITE_DEMO is compared inline so the demo build drops this code entirely.)
if (import.meta.env.VITE_DEMO !== '1' && import.meta.env.PROD && 'serviceWorker' in navigator && window.top === window.self) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {
        /* offline support is a bonus, never a blocker */
      });
  });
}

// Test hook for automated browser checks (no production behaviour depends on it).
(window as unknown as { __monster: unknown }).__monster = { studio, getState, setState, actions, bus };
