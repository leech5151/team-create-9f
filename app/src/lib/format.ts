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
