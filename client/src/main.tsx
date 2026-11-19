import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Augment window object for global PWA beforeinstallprompt capture
declare global {
  interface Window {
    __deferredPwaPrompt?: any;
  }
}

// Early capture of Chromium 'beforeinstallprompt' at module top-level before React mounts.
// Prevents missing the prompt if the browser fires the event before React lifecycle effects run.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    window.__deferredPwaPrompt = e;
    console.log('[PWA] Install prompt ready');
    window.dispatchEvent(new Event('tekdoctor:pwa-install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    window.__deferredPwaPrompt = null;
    console.log('[PWA] App successfully installed');
    window.dispatchEvent(new Event('tekdoctor:pwa-app-installed'));
  });
}

// Register PWA Service Worker for production "Add to Home Screen" & offline shell.
// In development, unregister any active service worker so dynamic Vite modules and HMR WebSockets are never intercepted.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    const registerSW = () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[PWA] Service Worker registered with scope:', reg.scope);
      }).catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
    };

    // Always register even if document load already completed
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('[Dev] Unregistered stale service worker:', registration.scope);
          }
        });
      }
    }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
