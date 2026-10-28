import type { RegistryMember } from './registry';

/**
 * 점수관리 등급 — shared by the screen and the downloadable image so both
 * name and colour a score the same way.
 */

export type RankIcon = 'crown' | 'star' | 'gem' | 'shield';

export interface Rank {
  label: string;
  color: string;
  icon: RankIcon;
}

/** Score bands, highest first: a member gets the first band whose floor they reach. */
const RANKS: readonly (Rank & { min: number })[] = [
  { min: 220, label: '챌린저', color: '#E0A100', icon: 'crown' },
  { min: 200, label: '마스터', color: '#8E44D9', icon: 'star' },
  { min: 180, label: '다이아', color: '#2F7CF6', icon: 'gem' },
  { min: 160, label: '플래티넘', color: '#139C92', icon: 'shield' },
  { min: 140, label: '골드', color: '#C9971C', icon: 'shield' },
  { min: 120, label: '실버', color: '#8A96A3', icon: 'shield' },
  { min: 0, label: '브론즈', color: '#B0703A', icon: 'shield' },
];

const BRONZE = RANKS[RANKS.length - 1] as Rank;

export const rankOf = (avg: number): Rank => RANKS.find((r) => avg >= r.min) ?? BRONZE;

/** From here the average is shown in red. */
export const HIGH_AVG = 200;
export const HIGH_COLOR = '#e5322d';

/** 16×16 paths — rendered as SVG on screen and as Path2D on the canvas. */
export const ICON_PATHS: Record<RankIcon, string> = {
  crown: 'M2 5l3.2 2.6L8 3l2.8 4.6L14 5l-1.2 7H3.2L2 5zm1.2 8h9.6v1.5H3.2z',
  star: 'M8 1.5l1.9 4.2 4.6.5-3.4 3.1 1 4.5L8 11.5l-4.1 2.3 1-4.5L1.5 6.2l4.6-.5z',
  gem: 'M4.5 2h7L15 6l-7 8.5L1 6l3.5-4zM1 6h14',
  shield: 'M8 1.5l5.5 2v4.2c0 3.4-2.4 5.8-5.5 6.8-3.1-1-5.5-3.4-5.5-6.8V3.5z',
};

/** Has a score to rank by — sheet members with no games stay at the bottom. */
export const scored = (m: RegistryMember) => m.games > 0 || m.recordNo === null;

/** Highest average first; unscored members after, by name. */
export const byScore = (a: RegistryMember, b: RegistryMember) =>
  Number(scored(b)) - Number(scored(a)) || b.avg - a.avg || a.name.localeCompare(b.name, 'ko');

/** What the row says under the name. */
export const gamesLabel = (m: RegistryMember) =>
  m.games > 0 ? `${m.games}게임` : m.recordNo === null ? '정모 멤버' : '기록 없음';
