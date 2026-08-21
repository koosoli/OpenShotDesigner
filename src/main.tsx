import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initProjectLibrary } from './utils/projectLibrary';

// Hydrate the project library (IndexedDB, with a localStorage fallback and a
// one-time import of pre-IndexedDB data) before the first render so every
// synchronous read in the app sees a complete library.
void initProjectLibrary()
  .catch(() => {
    // The library falls back to localStorage internally; never block startup.
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // Offline app shell (plan §5.4): production builds register the service
    // worker so an installed/opened build keeps working without network.
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
          // Offline support is progressive; registration failure is non-fatal.
        });
      });
    }
  });
