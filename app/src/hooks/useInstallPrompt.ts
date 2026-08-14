import { useCallback, useEffect, useState } from 'react';

/** Chromium-only event that lets a page trigger the install flow itself. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Remembers the collapsed/expanded choice — never a permanent dismissal. */
const COLLAPSED_KEY = 'bowling-lane-draw/install-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
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

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS reports as Mac; touch points give it away.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Drives the install affordance.
 *
 * Collapsing shrinks the banner to a pill rather than hiding it: the entry
 * point stays available for as long as the app is installable, so it can be
 * installed on another device or after being removed.
 *
 * Chromium hands us a deferred prompt we can fire on a user gesture. iOS Safari
 * has no such API — installing is a manual Share-sheet step, so there we can
 * only show instructions.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [collapsed, setCollapsed] = useState(readCollapsed);

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

  const persistCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // Non-persistent state is still better than nothing.
    }
  };

  const collapse = useCallback(() => persistCollapsed(true), []);
  const expand = useCallback(() => persistCollapsed(false), []);

  /** Resolves to true when the user accepted the browser's install dialog. */
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      // Declining collapses rather than hides — they may want it later.
      if (outcome !== 'accepted') persistCollapsed(true);
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }, [deferred]);

  const ios = isIosDevice();

  return {
    /** Chromium can open the native install dialog right now. */
    canPrompt: deferred !== null,
    /** iOS needs Share-sheet instructions instead of a dialog. */
    isIos: ios,
    /** Whether any install path exists on this browser. */
    installable: !installed && (deferred !== null || ios),
    installed,
    collapsed,
    collapse,
    expand,
    install,
  };
}
