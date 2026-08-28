import type { LeaguePlayer } from './types';

export type LeagueTier = 'gold' | 'silver' | 'bronze';

export const TIER_META: Record<LeagueTier, { label: string; color: string }> = {
  gold: { label: '골드', color: '#D9A21B' },
  silver: { label: '실버', color: '#8E959E' },
  bronze: { label: '브론즈', color: '#B0703C' },
};

export const TIER_ORDER: readonly LeagueTier[] = ['gold', 'silver', 'bronze'];

/** Share of the ranked field in each tier: 상위 30% / 40% / 30%. */
const GOLD_SHARE = 0.3;
const SILVER_SHARE = 0.4;

export interface TieredPlayer extends LeaguePlayer {
  /** null for players with no 점수 recorded — they cannot be ranked. */
  tier: LeagueTier | null;
  /** 점수 with the handicap added and the penalty taken off. */
  effective: number | null;
}

/**
 * The figure the tiers are cut on: the registered 점수 adjusted the same way a
 * game is, so a big handicap moves a player up and a penalty moves them down.
 */
export function effectiveScore(p: LeaguePlayer): number | null {
  if (p.avg === null) return null;
  return p.avg + p.handicap - p.penalty;
}

export interface ScoreBreakdown {
  /** 점수 + 핸디 − 패널티 — the figure tiers and games are decided on. */
  effective: number;
  /** The registered 점수 before adjustment. */
  base: number;
  /** Signed adjustment labels, e.g. ["+12", "−6"]. Empty when nothing applies. */
  adjustments: string[];
}

/**
 * Splits an effective score into its parts so the UI can show the working:
 * `176 (164 +12)`. Returns null when no 점수 is recorded.
 */
export function scoreBreakdown(p: LeaguePlayer): ScoreBreakdown | null {
  if (p.avg === null) return null;
  const adjustments: string[] = [];
  if (p.handicap > 0) adjustments.push(`+${p.handicap}`);
  if (p.penalty > 0) adjustments.push(`−${p.penalty}`);
  return { effective: p.avg + p.handicap - p.penalty, base: p.avg, adjustments };
}

/**
 * Splits players into 골드 / 실버 / 브론즈 by effective score.
 *
 * Cuts are by rank, not by score threshold, so the shares hold regardless of
 * how the scores cluster. Players with no 점수 are returned with `tier: null`
 * rather than being ranked as zero, which would misfile them as 브론즈.
 *
 * Returned in ranking order: highest effective score first, unranked last.
 */
export function assignLeagueTiers(players: readonly LeaguePlayer[]): TieredPlayer[] {
  const withScore: TieredPlayer[] = [];
  const withoutScore: TieredPlayer[] = [];

  for (const p of players) {
    const effective = effectiveScore(p);
    if (effective === null) withoutScore.push({ ...p, tier: null, effective: null });
    else withScore.push({ ...p, tier: 'bronze', effective });
  }

  withScore.sort(
    (a, b) => (b.effective ?? 0) - (a.effective ?? 0) || a.name.localeCompare(b.name, 'ko'),
  );

  const n = withScore.length;
  // At least one 골드 whenever anyone is ranked, so a tiny league still has a top.
  const gold = n === 0 ? 0 : Math.max(1, Math.round(n * GOLD_SHARE));
  const silver = Math.min(Math.round(n * SILVER_SHARE), Math.max(0, n - gold));

  withScore.forEach((p, i) => {
    p.tier = i < gold ? 'gold' : i < gold + silver ? 'silver' : 'bronze';
  });

  withoutScore.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return [...withScore, ...withoutScore];
}

/** Convenience grouping for the roster screen. */
export function groupByTier(players: readonly LeaguePlayer[]): {
  tiers: Record<LeagueTier, TieredPlayer[]>;
  unranked: TieredPlayer[];
} {
  const ranked = assignLeagueTiers(players);
  return {
    tiers: {
      gold: ranked.filter((p) => p.tier === 'gold'),
      silver: ranked.filter((p) => p.tier === 'silver'),
      bronze: ranked.filter((p) => p.tier === 'bronze'),
    },
    unranked: ranked.filter((p) => p.tier === null),
  };
}
