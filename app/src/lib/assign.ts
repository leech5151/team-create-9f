import type { HistoryEntry, Lane, Member, Options } from '../types';
import { TIERS } from '../types';

/** Fisher–Yates on a copy. */
export function shuffle<T>(input: readonly T[]): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Unordered pair key, so (a,b) and (b,a) collide. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function stddev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

export function laneAverage(members: readonly Member[]): number {
  if (members.length === 0) return 0;
  return Math.round(members.reduce((s, m) => s + m.avg, 0) / members.length);
}

/**
 * Lane count is the size of the largest tier: every lane takes at most one
 * member per tier, so the fullest tier decides how many lanes are needed.
 * When tiers are uneven the trailing lanes simply come up short.
 */
export function laneCountFor(attending: readonly Member[]): number {
  const sizes = TIERS.map((t) => attending.filter((m) => m.tier === t).length);
  return Math.max(0, ...sizes);
}

/** Every pair of members that has already shared a lane in a past game. */
function pastPairs(history: readonly HistoryEntry[]): Set<string> {
  const past = new Set<string>();
  for (const entry of history) {
    for (const lane of entry.lanes) {
      for (let i = 0; i < lane.length; i++) {
        for (let j = i + 1; j < lane.length; j++) {
          past.add(pairKey(lane[i]!, lane[j]!));
        }
      }
    }
  }
  return past;
}

/** Lower is better. Each enabled option contributes an independently weighted penalty. */
function scoreLanes(
  lanes: readonly Member[][],
  attending: readonly Member[],
  opts: Options,
  past: ReadonlySet<string>,
): number {
  let score = 0;

  if (opts.balance) {
    const avgs = lanes.map((l) => l.reduce((s, m) => s + m.avg, 0) / l.length);
    score += stddev(avgs) * 3;
  }

  if (opts.avoid) {
    for (const lane of lanes) {
      for (let i = 0; i < lane.length; i++) {
        for (let j = i + 1; j < lane.length; j++) {
          if (past.has(pairKey(lane[i]!.id, lane[j]!.id))) score += 12;
        }
      }
    }
  }

  if (opts.gender) {
    const femaleTotal = attending.filter((m) => m.gender === '여').length;
    const target = femaleTotal / lanes.length;
    for (const lane of lanes) {
      score += Math.abs(lane.filter((m) => m.gender === '여').length - target) * 2;
    }
  }

  return score;
}

const ITERATIONS = 300;

/**
 * Build lanes by shuffling each tier into a column and reading across rows,
 * keeping the best-scoring attempt out of `ITERATIONS` tries.
 *
 * With no options enabled there is nothing to optimise, so a single shuffle runs.
 */
export function buildLanes(
  attending: readonly Member[],
  opts: Options,
  history: readonly HistoryEntry[],
): Lane[] {
  const laneCount = laneCountFor(attending);
  if (laneCount === 0) return [];

  const columns = TIERS.map((t) => attending.filter((m) => m.tier === t));
  const past = opts.avoid ? pastPairs(history) : new Set<string>();
  const tries = opts.balance || opts.avoid || opts.gender ? ITERATIONS : 1;

  let best: { score: number; lanes: Member[][] } | null = null;

  for (let attempt = 0; attempt < tries; attempt++) {
    const shuffled = columns.map((c) => shuffle(c));
    const lanes: Member[][] = [];
    for (let row = 0; row < laneCount; row++) {
      lanes.push(shuffled.map((c) => c[row]).filter((m): m is Member => m !== undefined));
    }
    const score = scoreLanes(lanes, attending, opts, past);
    if (!best || score < best.score) best = { score, lanes };
  }

  return best!.lanes.map((members, i) => ({
    no: i + 1,
    members,
    avg: laneAverage(members),
  }));
}

/** Spread of per-lane averages — the "평균 편차 ±x" badge on the result screen. */
export function laneAvgDeviation(lanes: readonly Lane[]): number {
  return stddev(lanes.map((l) => l.avg));
}

/** How many pairs in `lanes` also shared a lane in `history`. */
export function repeatPairCount(lanes: readonly Lane[], history: readonly HistoryEntry[]): number {
  const past = pastPairs(history);
  let count = 0;
  for (const lane of lanes) {
    const ms = lane.members;
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        if (past.has(pairKey(ms[i]!.id, ms[j]!.id))) count++;
      }
    }
  }
  return count;
}

/** Draw order: tier by tier, shuffled within each tier. */
export function buildQueue(attending: readonly Member[]): string[] {
  return TIERS.flatMap((t) => shuffle(attending.filter((m) => m.tier === t)).map((m) => m.id));
}
