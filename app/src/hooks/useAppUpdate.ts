import { useRegisterSW } from 'virtual:pwa-register/react';

/** How often an open app asks the server for a new build. */
const CHECK_MS = 60_000;

/**
 * New-build detection for the installed app.
 *
 * The service worker only looks for an update when the page is loaded, and a
 * home-screen app is rarely reloaded — it is resumed from the background. So
 * it is asked again every minute and whenever the app comes back to the front.
 * The new build waits until `apply`, so nobody is reloaded mid-draw.
 */
export function useAppUpdate(): { ready: boolean; apply: () => void } {
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine) void reg.update();
      };
      setInterval(check, CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
  return { ready, apply: () => void updateServiceWorker(true) };
}
