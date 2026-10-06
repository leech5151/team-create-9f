import { useCallback, useEffect, useState } from 'react';

/** Chromium-only event that lets a page trigger the install flow itself. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
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
 * In-app browsers that cannot add anything to the home screen.
 *
 * This is the usual reason installing "doesn't work" on an iPhone: the link
 * arrives in a chat and opens inside that app's own web view, whose share menu
 * has no 홈 화면에 추가 at all. Nothing on the page can fix that — the user has
 * to reopen the link in Safari — so the name is surfaced to say which app.
 */
const IN_APP_BROWSERS: readonly { pattern: RegExp; name: string }[] = [
  { pattern: /KAKAOTALK/i, name: '카카오톡' },
  { pattern: /NAVER\(inapp|NAVER /i, name: '네이버 앱' },
  { pattern: /Instagram/i, name: '인스타그램' },
  { pattern: /FBAN|FBAV/i, name: '페이스북' },
  { pattern: /Line\//i, name: '라인' },
  { pattern: /DaumApps/i, name: '다음 앱' },
];

function inAppBrowserName(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  return IN_APP_BROWSERS.find((b) => b.pattern.test(ua))?.name ?? null;
}

/**
 * Drives the install button.
 *
 * There is nothing to dismiss: the button is shown whenever the app is running
 * in a browser tab and goes away by itself once it is installed and opened
 * standalone.
 *
 * Chromium hands us a deferred prompt we can fire on a user gesture. iOS Safari
 * has no such API — installing is a manual Share-sheet step, so there we can
 * only point at the menu.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

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

  /** Resolves to true when the user accepted the browser's install dialog. */
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
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
    /** Name of the in-app browser in use, or null in a real browser. */
    inAppBrowser: inAppBrowserName(),
    /** What to say when the browser gives us no dialog to open. */
    hint: ios
      ? '공유 버튼 → “홈 화면에 추가”를 누르면 앱처럼 열려요'
      : '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요',
    /**
     * Shown whenever the app is not already running standalone.
     *
     * Deliberately not gated on `beforeinstallprompt`: that event only fires on
     * Chromium, and only once its engagement heuristics are satisfied, so
     * gating on it left most browsers with no way in at all. Without a deferred
     * prompt the button falls back to saying where the menu item is.
     */
    installable: !installed,
    installed,
    install,
  };
}
