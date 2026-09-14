import type { Lane } from '../types';

/** "8월 10일" — the prototype hardcoded this; a real session uses today. */
export function todayLabel(now: Date = new Date()): string {
  return `${now.getMonth() + 1}월 ${now.getDate()}일`;
}

/** "8/10" — compact form for the share sheet's corner meta. */
export function todayShort(now: Date = new Date()): string {
  return `${now.getMonth() + 1}/${now.getDate()}`;
}

export const namesLine = (lane: Lane): string => lane.members.map((m) => m.name).join(' · ');

/** Plain-text summary for the clipboard / Web Share payload. */
export function shareText(game: number, lanes: readonly Lane[]): string {
  const header = `GAME ${game} 레인 배정 · ${todayLabel()} 정기모임`;
  const body = lanes.map((l) => `${l.no}번  ${namesLine(l)}  (AVG ${l.avg})`);
  return [header, ...body].join('\n');
}

/** One game's lanes, as 기록 holds them. */
export interface GameLanes {
  game: number;
  lanes: readonly Lane[];
}

/**
 * Every game in one message, for sharing a night's 기록 at once.
 *
 * The date heads the whole thing rather than repeating per game — pasted into
 * a chat it reads as one post, not as several stacked copies of `shareText`.
 */
export function shareGamesText(games: readonly GameLanes[]): string {
  const header = `${todayLabel()} 정기모임 레인 배정`;
  const blocks = games.map(({ game, lanes }) =>
    [`[GAME ${game}]`, ...lanes.map((l) => `${l.no}번  ${namesLine(l)}  (AVG ${l.avg})`)].join('\n'),
  );
  return [header, ...blocks].join('\n\n');
}
