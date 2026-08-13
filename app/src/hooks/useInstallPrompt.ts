import { useCallback, useEffect, useState } from 'react';

/** Chromium-only event that lets a page trigger the install flow itself. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'bowling-lane-draw/install-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari predates display-mode and exposes its own flag.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS reports as Mac; touch points give it away.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Drives the "홈 화면에 추가" banner.
 *
 * Chromium hands us a deferred prompt we can fire on a user gesture. iOS Safari
 * has no such API — installing is a manual Share-sheet step, so there we can
 * only show instructions.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep the browser's own mini-infobar from firing
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const mql = window.matchMedia('(display-mode: standalone)');
    const onDisplayMode = (e: MediaQueryListEvent) => setInstalled(e.matches);
    mql.addEventListener('change', onDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mql.removeEventListener('change', onDisplayMode);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Non-persistent dismissal is still better than nothing.
    }
  }, []);

  /** Resolves to true when the user accepted the browser's install dialog. */
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === 'accepted') return true;
      dismiss();
      return false;
    } catch {
      return false;
    }
  }, [deferred, dismiss]);

  const ios = isIos();

  return {
    /** Chromium: we can open the install dialog directly. */
    canInstall: !installed && !dismissed && deferred !== null,
    /** iOS: show Share-sheet instructions instead. */
    showIosHint: !installed && !dismissed && ios && deferred === null,
    installed,
    install,
    dismiss,
  };
}
