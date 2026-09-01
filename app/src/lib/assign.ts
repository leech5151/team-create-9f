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

/** Hard ceiling per lane — a lane never holds four. */
export const MAX_PER_LANE = 3;
/** Lanes are booked in pairs; one table is two adjacent lanes. */
export const LANES_PER_TABLE = 2;

/** Fewest lanes that can seat everyone at three per lane. */
export function minLaneCount(count: number): number {
  return count === 0 ? 0 : Math.ceil(count / MAX_PER_LANE);
}

/** Nobody bowls alone; a lane worth opening seats at least this many. */
const MIN_PER_LANE = 2;

/**
 * Default lane count: the fewest that seat everyone at three per lane, rounded
 * up to a whole table — but only when the extra lane still leaves every lane
 * with at least two players. Spreading a small group across an empty-ish extra
 * lane is worse than leaving one table half-booked.
 */
export function laneCountFor(attending: readonly Member[]): number {
  const count = attending.length;
  const need = minLaneCount(count);
  if (need === 0) return 0;

  const rounded = Math.ceil(need / LANES_PER_TABLE) * LANES_PER_TABLE;
  return rounded * MIN_PER_LANE <= count ? rounded : need;
}

/**
 * How many players go in each lane.
 *
 * Sizes differ by at most one, and the extras are dealt one per table before
 * any table gets a second — so 20 people over 8 lanes comes out 2,3,2,3,2,3,2,3
 * and every table seats five. Within a table the larger lane comes second,
 * which is what produces that alternating read.
 *
 * Returns an empty array when the lanes cannot seat everyone at three each.
 */
export function laneSizes(count: number, laneCount: number): number[] {
  if (laneCount <= 0 || count <= 0) return [];
  if (laneCount * MAX_PER_LANE < count) return [];

  // More lanes than players would leave a lane empty; open only what is used.
  const lanes = Math.min(laneCount, count);

  const base = Math.floor(count / lanes);
  let extras = count % lanes;
  const sizes = Array.from({ length: lanes }, () => base);

  const tables = Math.ceil(lanes / LANES_PER_TABLE);
  // Second lane of each table first, then the first lane — one pass per offset.
  for (let offset = LANES_PER_TABLE - 1; offset >= 0 && extras > 0; offset--) {
    for (let t = 0; t < tables && extras > 0; t++) {
      const lane = t * LANES_PER_TABLE + offset;
      if (lane >= lanes) continue;
      if (sizes[lane]! >= MAX_PER_LANE) continue;
      sizes[lane]! += 1;
      extras -= 1;
    }
  }
  return sizes;
}

/** Highest average first; name then id break ties so the order is stable. */
const byStrength = (a: Member, b: Member) =>
  b.avg - a.avg || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);

/**
 * Splits the attending group into three tiers by average, in equal proportion.
 *
 * Tiers are a view of relative strength, so they hold their shape as the roster
 * changes: dropping one player re-cuts all three bands rather than shrinking
 * only the last. Any remainder goes to the stronger tiers first.
 *
 * This is deliberately independent of the seating plan — how many lanes are
 * booked decides the *dealing* order (see `draftBands`), not who counts as a
 * 1티어 player.
 */
export function assignTiers(attending: readonly Member[]): Ranked[] {
  const n = attending.length;
  if (n === 0) return [];

  const base = Math.floor(n / 3);
  const remainder = n % 3;
  const bands = [0, 1, 2].map((i) => base + (i < remainder ? 1 : 0));

  const sorted = attending.slice().sort(byStrength);
  const ranked: Ranked[] = [];
  let cursor = 0;
  for (const [index, size] of bands.entries()) {
    const tier = (index + 1) as Tier;
    for (let i = 0; i < size && cursor < sorted.length; i++, cursor++) {
      ranked.push({ ...sorted[cursor]!, tier });
    }
  }
  return ranked;
}

/**
 * Dealing order for lane construction: one round per seat.
 *
 * Round 1 takes the strongest players — one for every lane. Round 2 the next,
 * and round 3 only enough for the lanes that seat three. Balance comes from
 * this rank-based dealing, which is why it follows `laneSizes` instead of the
 * proportional tiers above.
 */
function draftBands(attending: readonly Member[], sizes: readonly number[]): Member[][] {
  const sorted = attending.slice().sort(byStrength);
  const bands: Member[][] = [];
  let cursor = 0;
  for (const round of [1, 2, 3]) {
    const seats = sizes.filter((size) => size >= round).length;
    bands.push(sorted.slice(cursor, cursor + seats));
    cursor += seats;
  }
  return bands;
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
/** Sum of a table's two lanes; a trailing odd lane forms a table of its own. */
function tableTotals(lanes: readonly Ranked[][]): number[] {
  const totals: number[] = [];
  for (let i = 0; i < lanes.length; i += LANES_PER_TABLE) {
    let sum = 0;
    for (let j = i; j < Math.min(i + LANES_PER_TABLE, lanes.length); j++) {
      sum += lanes[j]!.reduce((acc, m) => acc + m.avg, 0);
    }
    totals.push(sum);
  }
  return totals;
}

function scoreLanes(
  lanes: readonly Ranked[][],
  attending: readonly Member[],
  opts: Options,
  past: ReadonlySet<string>,
): number {
  let score = 0;

  if (opts.balance) {
    const avgs = lanes.filter((l) => l.length > 0).map((l) => l.reduce((s, m) => s + m.avg, 0) / l.length);
    score += stddev(avgs) * 3;
    // Two lanes make a table, and people compare tables — so even them out too.
    score += stddev(tableTotals(lanes)) * 0.5;
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
 * One candidate arrangement: each dealing round shuffled, then handed out to
 * the lanes that still have a seat for it.
 *
 * Lanes that seat three are the only ones reached by round 3, so no lane ever
 * exceeds `MAX_PER_LANE` and none is left short.
 */
function layout(
  bands: readonly Member[][],
  sizes: readonly number[],
  tierOf: ReadonlyMap<string, Tier>,
): Ranked[][] {
  const lanes: Ranked[][] = sizes.map(() => []);

  for (const [index, band] of bands.entries()) {
    const round = index + 1;
    // Randomise which qualifying lane gets which player, but keep the round.
    const eligible = shuffle(
      sizes.map((size, lane) => ({ size, lane })).filter((l) => l.size >= round),
    );
    shuffle(band).forEach((member, i) => {
      const target = eligible[i];
      if (target) lanes[target.lane]!.push({ ...member, tier: tierOf.get(member.id) ?? 3 });
    });
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
  laneCount?: number,
): Lane[] {
  if (attending.length === 0) return [];

  const requested = laneCount ?? laneCountFor(attending);
  const sizes =
    laneSizes(attending.length, requested).length > 0
      ? laneSizes(attending.length, requested)
      : laneSizes(attending.length, minLaneCount(attending.length));
  if (sizes.length === 0) return [];

  const tierOf = tierMap(attending);
  const bands = draftBands(attending, sizes);
  const past = opts.avoid ? pastPairs(history) : new Set<string>();
  const tries = opts.balance || opts.avoid || opts.gender ? ITERATIONS : 1;

  let best: { score: number; lanes: Ranked[][] } | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const lanes = layout(bands, sizes, tierOf);
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
