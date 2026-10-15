import { EXCHANGE_TABS, type ExchangeTab } from '../types';

/**
 * Hash routes for 교류전 — `#/exchange/<tab>`.
 *
 * The rest of the app navigates by React state alone. 교류전 is used mid-match
 * on several phones at once, so a tab has to survive a reload and be linkable.
 * A hash rather than a path, because GitHub Pages serves one index.html and
 * would 404 a deep path.
 */
export interface ExchangeRoute {
  section: 'exchange';
  tab: ExchangeTab;
}

export function parseRoute(hash: string): ExchangeRoute | null {
  const m = /^#\/exchange(?:\/([a-z]+))?\/?$/.exec(hash);
  if (!m) return null;
  const tab = EXCHANGE_TABS.find((t) => t.key === m[1])?.key ?? 'main';
  return { section: 'exchange', tab };
}

export function exchangeHash(tab: ExchangeTab): string {
  return `#/exchange/${tab}`;
}

/**
 * Rewrites the URL in place. `replaceState`, not `pushState`: the back guard
 * owns the history stack, and tab changes must not add entries to it.
 */
export function writeHash(hash: string): void {
  if (location.hash === hash) return;
  const url = hash === '' ? location.pathname + location.search : hash;
  history.replaceState(history.state, '', url);
}
