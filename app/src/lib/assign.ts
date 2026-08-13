import type { HistoryEntry, Lane, Member, Options, Ranked, Tier } from '../types';

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
 * Lanes hold three players — one per tier — so the number of lanes is how many
 * complete threes the group makes. Anyone left over (at most two) joins an
 * existing lane as a fourth rather than sitting alone.
 */
export function laneCountFor(attending: readonly Member[]): number {
  const n = attending.length;
  if (n === 0) return 0;
  return Math.max(1, Math.floor(n / 3));
}

/** Highest average first; name then id break ties so the order is stable. */
const byStrength = (a: Member, b: Member) =>
  b.avg - a.avg || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);

/**
 * Splits the attending group into three tiers by average, in proportion to the
 * group size. Tiers 1 and 2 take one player per lane; tier 3 absorbs the
 * remainder, whose extras become fourth members during `buildLanes`.
 */
export function assignTiers(attending: readonly Member[]): Ranked[] {
  const n = attending.length;
  if (n === 0) return [];

  const laneCount = laneCountFor(attending);
  const size1 = Math.min(laneCount, n);
  const size2 = Math.min(laneCount, n - size1);

  const sorted = attending.slice().sort(byStrength);
  return sorted.map((m, i) => ({
    ...m,
    tier: (i < size1 ? 1 : i < size1 + size2 ? 2 : 3) as Tier,
  }));
}

/** Convenience lookup for screens that render one member at a time. */
export function tierMap(attending: readonly Member[]): Map<string, Tier> {
  return new Map(assignTiers(attending).map((m) => [m.id, m.tier]));
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
  lanes: readonly Ranked[][],
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

/** One candidate arrangement: a shuffle of each tier read across into lanes. */
function layout(ranked: readonly Ranked[], laneCount: number): Ranked[][] {
  const columns: Ranked[][] = [1, 2, 3].map((t) => shuffle(ranked.filter((m) => m.tier === t)));
  const lanes: Ranked[][] = [];
  for (let row = 0; row < laneCount; row++) {
    lanes.push(columns.map((c) => c[row]).filter((m): m is Ranked => m !== undefined));
  }

  // Tier 3 carries the remainder; those extras become fourth members, spread
  // across lanes so nobody ends up bowling alone. Very small groups can have
  // more extras than lanes (5 people = 1 lane, 2 extras), so cycle rather than
  // assuming one extra per lane.
  const extras = columns[2]!.slice(laneCount);
  if (extras.length > 0) {
    const order = shuffle(lanes.map((_, i) => i));
    extras.forEach((m, i) => lanes[order[i % order.length]!]!.push(m));
  }
  return lanes;
}

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

  const ranked = assignTiers(attending);
  const past = opts.avoid ? pastPairs(history) : new Set<string>();
  const tries = opts.balance || opts.avoid || opts.gender ? ITERATIONS : 1;

  let best: { score: number; lanes: Ranked[][] } | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const lanes = layout(ranked, laneCount);
    const score = scoreLanes(lanes, attending, opts, past);
    if (!best || score < best.score) best = { score, lanes };
  }

  return best!.lanes.map((members, i) => ({
    no: i + 1,
    members,
    avg: laneAverage(members),
  }));
}

/**
 * Rebuild displayable lanes from persisted ids. Tiers are recomputed from the
 * members the lanes actually contain, so the view stays self-consistent even
 * if the attendance list changed afterwards.
 */
export function hydrateLanes(
  laneIds: readonly string[][],
  byId: ReadonlyMap<string, Member>,
): Lane[] {
  const present = laneIds
    .flat()
    .map((id) => byId.get(id))
    .filter((m): m is Member => m !== undefined);
  const tiers = tierMap(present);

  return laneIds.map((ids, i) => {
    const members: Ranked[] = ids
      .map((id) => byId.get(id))
      .filter((m): m is Member => m !== undefined)
      .map((m) => ({ ...m, tier: tiers.get(m.id) ?? 3 }));
    return { no: i + 1, members, avg: laneAverage(members) };
  });
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
  const ranked = assignTiers(attending);
  return [1, 2, 3].flatMap((t) => shuffle(ranked.filter((m) => m.tier === t)).map((m) => m.id));
}
