import { useEffect, useRef } from 'react';

/**
 * Back-button handling for an app with no router.
 *
 * Every sheet and overlay here is React state, so the browser's back gesture
 * had nothing of ours to pop and left the site instead — on an installed PWA
 * that reads as the app closing itself. The fix is a stack: anything
 * dismissable registers a closer while it is open, and back closes the topmost
 * one. With the stack empty, back walks up a screen, and only then leaves.
 *
 * A module-level stack rather than context: there is one App, the order that
 * matters is the order things actually opened, and a sheet deep inside a tab
 * can then opt in without threading a provider through every screen.
 */

interface Layer {
  id: number;
  close: () => void;
}

const stack: Layer[] = [];
let nextId = 1;

/** Closes the most recently opened layer. False when there was none. */
export function closeTopLayer(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.close();
  return true;
}

/**
 * Registers `onClose` as back-dismissable for as long as `open` is true.
 *
 * `onClose` is read through a ref, so a handler rebuilt on every render does
 * not churn the registration — only `open` does.
 */
export function useDismissible(open: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!open) return;
    const layer: Layer = { id: nextId++, close: () => latest.current() };
    stack.push(layer);
    return () => {
      // Closed by its own button rather than by back — drop it from the stack.
      const at = stack.indexOf(layer);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [open]);
}

/** How long the second press has to come to actually leave the app. */
const EXIT_WINDOW_MS = 2000;

/**
 * Makes the browser's back button walk up the app instead of leaving it.
 *
 * One sentinel history entry is kept ahead of the user at all times: back
 * consumes it, and we push another straight away, so the entry count never
 * grows and the guard is never disarmed. Letting an unhandled press through
 * instead would disarm it — the next trip into a section would then have no
 * sentinel, and *that* back would drop out of the app with no warning.
 *
 * At the top with nothing open, the first press asks and the second within
 * `EXIT_WINDOW_MS` leaves. Trapping the user outright would be worse, but so
 * would closing an installed app on a stray swipe.
 *
 * @param goUp Navigates one level up. Returns false when already at the top.
 * @param onAskExit Tells the user another press will leave.
 */
export function useBackGuard(goUp: () => boolean, onAskExit: () => void): void {
  const latest = useRef({ goUp, onAskExit });
  latest.current = { goUp, onAskExit };
  const askedAt = useRef(0);

  useEffect(() => {
    const arm = () => history.pushState({ backGuard: true }, '');
    arm();

    const onPop = () => {
      if (closeTopLayer() || latest.current.goUp()) {
        askedAt.current = 0;
        arm();
        return;
      }
      // Second press inside the window — let this one through and leave.
      if (Date.now() - askedAt.current < EXIT_WINDOW_MS) return;
      askedAt.current = Date.now();
      arm();
      latest.current.onAskExit();
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
