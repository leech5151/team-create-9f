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
}

export interface ScoreBreakdown {
  /** The registered 점수 — what tiers are cut on. */
  base: number;
  /** Signed adjustment labels, e.g. ["+12", "−6"]. Empty when nothing applies. */
  adjustments: string[];
}

/**
 * Splits a player's figures for display: `182 (+12)`.
 *
 * The handicap is shown but kept out of the headline number, because ranking on
 * an adjusted score would push a heavily handicapped player up a tier — the
 * opposite of what a handicap is for.
 */
export function scoreBreakdown(p: LeaguePlayer): ScoreBreakdown | null {
  if (p.avg === null) return null;
  const adjustments: string[] = [];
  if (p.handicap > 0) adjustments.push(`+${p.handicap}`);
  if (p.penalty > 0) adjustments.push(`−${p.penalty}`);
  return { base: p.avg, adjustments };
}

export interface ScoreStats {
  /** How many players have a 점수 recorded. */
  count: number;
  /** Mean of the raw 점수, rounded — handicaps are excluded, as with tiers. */
  mean: number;
  min: number;
  max: number;
}

/** Summary of the raw 점수 across everyone who has one. Null when nobody does. */
export function scoreStats(players: readonly LeaguePlayer[]): ScoreStats | null {
  const scores = players
    .map((p) => p.avg)
    .filter((v): v is number => v !== null);
  if (scores.length === 0) return null;

  const sum = scores.reduce((acc, v) => acc + v, 0);
  return {
    count: scores.length,
    mean: Math.round(sum / scores.length),
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

/**
 * Splits players into 골드 / 실버 / 브론즈 by raw 점수.
 *
 * Cuts are by rank, not by score threshold, so the shares hold regardless of
 * how the scores cluster. Players with no 점수 are returned with `tier: null`
 * rather than being ranked as zero, which would misfile them as 브론즈.
 *
 * Returned in ranking order: highest 점수 first, unranked last.
 */
export function assignLeagueTiers(players: readonly LeaguePlayer[]): TieredPlayer[] {
  const withScore: TieredPlayer[] = [];
  const withoutScore: TieredPlayer[] = [];

  for (const p of players) {
    if (p.avg === null) withoutScore.push({ ...p, tier: null });
    else withScore.push({ ...p, tier: 'bronze' });
  }

  withScore.sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || a.name.localeCompare(b.name, 'ko'));

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


export interface TeamScore {
  /** Sum of the members' raw 점수. */
  base: number;
  /** Sum of the members' handicaps. */
  handicap: number;
  /** Sum of the members' penalties. */
  penalty: number;
  /** How many members have a 점수 recorded, out of how many are on the team. */
  scored: number;
  size: number;
}

/**
 * Combined figures for a team, so two sides of a fixture can be compared at a
 * glance. Members without a 점수 contribute nothing to `base` but still count
 * toward `size`, which is what makes a partial total visible rather than
 * silently low.
 */
export function teamScore(members: readonly LeaguePlayer[]): TeamScore {
  let base = 0;
  let handicap = 0;
  let penalty = 0;
  let scored = 0;

  for (const m of members) {
    if (m.avg !== null) {
      base += m.avg;
      scored += 1;
    }
    handicap += m.handicap;
    penalty += m.penalty;
  }

  return { base, handicap, penalty, scored, size: members.length };
}


const TIER_RANK: Record<LeagueTier, number> = { gold: 0, silver: 1, bronze: 2 };

/**
 * Orders a team's roster 골드 → 실버 → 브론즈, then by 점수 within a tier.
 *
 * Tiers are cut across the whole league (`allPlayers`), not within the team —
 * a team's own three members would otherwise always come out one per tier.
 * Players with no 점수 sort last.
 */
export function orderRoster(
  members: readonly LeaguePlayer[],
  allPlayers: readonly LeaguePlayer[],
): TieredPlayer[] {
  const tierOf = new Map(assignLeagueTiers(allPlayers).map((p) => [p.id, p.tier] as const));

  // Deduplicate by id: a stray double row anywhere upstream would otherwise
  // render the same player twice in a fixture.
  const unique = [...new Map(members.map((m) => [m.id, m] as const)).values()];

  return unique
    .map((m) => ({ ...m, tier: tierOf.get(m.id) ?? null }))
    .sort((a, b) => {
      const ra = a.tier === null ? 3 : TIER_RANK[a.tier];
      const rb = b.tier === null ? 3 : TIER_RANK[b.tier];
      return ra - rb || (b.avg ?? -1) - (a.avg ?? -1) || a.name.localeCompare(b.name, 'ko');
    });
}
