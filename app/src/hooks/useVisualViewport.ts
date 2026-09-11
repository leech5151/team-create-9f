import { useEffect } from 'react';

/**
 * Publishes the *visible* viewport as CSS variables, so sheets can stay above
 * the on-screen keyboard.
 *
 * `100dvh` tracks the browser's collapsing toolbar but not the keyboard: iOS
 * shrinks the visual viewport and leaves the layout viewport at full height.
 * On a short phone that hides the bottom third of a sheet — on 경기 기록, the
 * 저장 bar itself, which is exactly where the numeric keypad is in use.
 *
 * Sets on the document element:
 *   --vv-h    height of the visible area
 *   --vv-top  how far the visible area has been pushed down
 *
 * Both stay unset when the browser has no `visualViewport`, so the stylesheet's
 * fallbacks (`100%`, `0px`) keep today's behaviour.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      // `offsetTop` is how far the visible area sits below the layout viewport,
      // which happens when the page itself scrolls under a raised keyboard.
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);

      /*
       * Keyboard heuristic: the visible area is much shorter than the layout
       * viewport. 160px clears toolbar collapse, which moves things by ~60.
       *
       * A short visible area is the one case where the sheet's bottom bar has
       * to give up room, and no media query can see it — media queries measure
       * the layout viewport, which the keyboard never shrinks on iOS.
       */
      const keyboard = window.innerHeight - vv.height > 160;
      if (keyboard) root.dataset.keyboard = 'up';
      else delete root.dataset.keyboard;
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vv-h');
      root.style.removeProperty('--vv-top');
      delete root.dataset.keyboard;
    };
  }, []);
}
