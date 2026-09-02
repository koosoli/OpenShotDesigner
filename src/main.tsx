import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initProjectLibrary } from './utils/projectLibrary';
import { loadStoredOflSnapshot, refreshOflSnapshotOnline } from './domain/fixtures';
import { hydrateCustomFixtureProfiles } from './domain/fixtures/customProfiles';

// Hydrate the project library (IndexedDB, with a localStorage fallback and a
// one-time import of pre-IndexedDB data) before the first render so every
// synchronous read in the app sees a complete library.
void initProjectLibrary()
  .catch(() => {
    // The library falls back to localStorage internally; never block startup.
  })
  .finally(() => {
    // Fixture catalog: user profiles first, then the last online OFL snapshot,
    // then (when online and stale) a fresh download — all without blocking render.
    hydrateCustomFixtureProfiles();
    void loadStoredOflSnapshot().then(() => refreshOflSnapshotOnline());

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // Offline app shell (plan §5.4): production builds register the service
    // worker so an installed/opened build keeps working without network.
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      const registerServiceWorker = () => {
        navigator.serviceWorker
          .register(`${import.meta.env.BASE_URL}sw.js`)
          .then((registration) => {
            // Check for a newer deploy on every load; the new worker takes
            // over silently and the next navigation serves the new bundle.
            registration.update().catch(() => undefined);
          })
          .catch(() => {
            // Offline support is progressive; registration failure is non-fatal.
          });
      };
      // Project-library hydration is asynchronous. On a fast page the load
      // event may already have fired before this finally block runs; adding a
      // listener at that point waits forever and the app never becomes
      // offline-capable. Register immediately in that case.
      if (document.readyState === 'complete') registerServiceWorker();
      else window.addEventListener('load', registerServiceWorker, { once: true });
    }
  });
