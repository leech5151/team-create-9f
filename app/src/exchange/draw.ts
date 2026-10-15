import { shuffle } from '../lib/assign';
import { handicapOf, type ExchangePlayer, type ExchangeSettings } from './api';

/**
 * 교류전 팀 짜기.
 *
 * 2레인이 한 테이블이고, 한 테이블이 한 팀이다. 세 방식 모두 같은 틀을 쓴다:
 * 순수 에버리지로 줄 세운 뒤 테이블 수만큼씩 끊어 '라운드'를 만들고, 라운드마다
 * 한 명씩 각 테이블에 나눠 준다. 그러면 테이블 인원은 ±1 안에서 같고, 상위·
 * 중위·하위가 테이블마다 같은 수만큼 들어간다 (6명 팀이면 티어별 2명).
 *
 * 라운드 안에서 누가 어느 테이블로 갈지는 무작위라, 여러 번 돌려 테이블
 * 평균(핸디 포함)이 가장 고른 배치를 고른다.
 */

export type ExchangeMethod = 'clubs' | 'mixed' | 'shuffle';

export const EXCHANGE_METHODS: readonly { key: ExchangeMethod; label: string; desc: string }[] = [
  { key: 'clubs', label: '팀vs팀', desc: '한 테이블(2레인)을 한 클럽이 씁니다. 클럽별로 번갈아 배치' },
  { key: 'mixed', label: '믹스팀', desc: '한 테이블에 양 클럽 반반 · 레인은 같은 클럽끼리' },
  { key: 'shuffle', label: '완전섞기', desc: '레인까지 클럽 구분 없이 섞되 테이블 밸런스는 맞춤' },
];

export const methodLabel = (m: ExchangeMethod) =>
  EXCHANGE_METHODS.find((x) => x.key === m)?.label ?? m;

export const LANES_PER_TABLE = 2;
/** Seats a table is planned around when the lane count is automatic. */
const PER_TABLE = 6;
const ATTEMPTS = 400;

/** Lanes for `count` players at six a table, always a whole number of tables. */
export function autoLaneCount(count: number): number {
  return Math.max(1, Math.ceil(count / PER_TABLE)) * LANES_PER_TABLE;
}

const byAvgDesc = (a: ExchangePlayer, b: ExchangePlayer) =>
  b.avg - a.avg || a.name.localeCompare(b.name);

/**
 * 1·2·3티어 — 순수 에버리지 순위를 세 등분. `scope` 안에서만 순위를 매기므로
 * 클럽별로 부르면 클럽 안 티어, 전체로 부르면 전체 티어가 된다.
 */
export function tiersWithin(scope: readonly ExchangePlayer[]): Map<string, 1 | 2 | 3> {
  const sorted = scope.slice().sort(byAvgDesc);
  const n = sorted.length;
  return new Map(
    sorted.map((p, i) => [p.id, Math.min(3, Math.floor((i * 3) / n) + 1) as 1 | 2 | 3]),
  );
}

/** 이 방식에서 티어를 매기는 범위 — 클럽 대전은 클럽 안, 완전섞기는 전체. */
export function tierMapFor(
  method: ExchangeMethod,
  players: readonly ExchangePlayer[],
): Map<string, 1 | 2 | 3> {
  if (method === 'shuffle') return tiersWithin(players);
  return new Map([
    ...tiersWithin(players.filter((p) => p.side === 'home')),
    ...tiersWithin(players.filter((p) => p.side === 'away')),
  ]);
}

/**
 * Deals `players` across `tables` one round at a time. A short last round goes
 * to the tables holding the fewest so far, which keeps sizes within one.
 */
function dealRounds(players: readonly ExchangePlayer[], tables: number): ExchangePlayer[][] {
  const out: ExchangePlayer[][] = Array.from({ length: tables }, () => []);
  const sorted = players.slice().sort(byAvgDesc);
  for (let i = 0; i < sorted.length; i += tables) {
    const round = shuffle(sorted.slice(i, i + tables));
    const targets = shuffle(out.map((_, t) => t)).sort((a, b) => out[a]!.length - out[b]!.length);
    round.forEach((p, k) => out[targets[k]!]!.push(p));
  }
  return out;
}

function spread(tables: readonly (readonly ExchangePlayer[])[], s: ExchangeSettings): number {
  const avgs = tables
    .filter((t) => t.length > 0)
    .map((t) => t.reduce((sum, p) => sum + p.avg + handicapOf(p, s), 0) / t.length);
  if (avgs.length === 0) return 0;
  const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
  return avgs.reduce((a, v) => a + (v - mean) ** 2, 0);
}

function best<T>(make: () => T, score: (t: T) => number): T {
  let pick = make();
  let low = score(pick);
  for (let i = 1; i < ATTEMPTS; i++) {
    const next = make();
    const v = score(next);
    if (v < low) {
      pick = next;
      low = v;
    }
  }
  return pick;
}

/**
 * Two lanes out of one table. Snake order (0,1,1,0,0,1 …) over the averages
 * keeps the lanes even; the larger half goes second, matching 팀짜기.
 */
function splitTable(table: readonly ExchangePlayer[], random: boolean): [string[], string[]] {
  if (random) {
    // 완전섞기: 클럽 상관없이 반으로 자른다.
    const ids = shuffle(table).map((p) => p.id);
    const cut = Math.floor(ids.length / 2);
    return [ids.slice(0, cut), ids.slice(cut)];
  }
  const lanes: [string[], string[]] = [[], []];
  table
    .slice()
    .sort(byAvgDesc)
    .forEach((p, i) => {
      const lane = Math.floor(i / 2) % 2 === 0 ? i % 2 : 1 - (i % 2);
      lanes[lane]!.push(p.id);
    });
  // 홀수 인원이면 큰 쪽이 뒤로.
  return lanes[0].length > lanes[1].length ? [lanes[1], lanes[0]] : lanes;
}

/**
 * How many of `tables` go to home in 팀vs팀 — whichever split brings the two
 * clubs' table sizes closest.
 */
export function homeTableCount(home: number, away: number, tables: number): number {
  if (away === 0) return tables;
  if (home === 0) return 0;
  let pick = 1;
  let gap = Infinity;
  for (let h = 1; h < tables; h++) {
    const g = Math.abs(home / h - away / (tables - h));
    if (g < gap) {
      gap = g;
      pick = h;
    }
  }
  return pick;
}

/** Why a draw cannot run with these players and lanes, or null when it can. */
export function drawProblem(
  method: ExchangeMethod,
  players: readonly ExchangePlayer[],
  laneCount: number,
): string | null {
  const tables = laneCount / LANES_PER_TABLE;
  const home = players.filter((p) => p.side === 'home').length;
  const away = players.length - home;
  if (players.length === 0) return '선수명단을 먼저 등록해 주세요.';
  if (players.length < tables * 2) return `${laneCount}레인을 채우기엔 인원이 부족합니다.`;
  if (method === 'clubs') {
    if (home > 0 && away > 0 && tables < 2) return '팀vs팀은 최소 2테이블(4레인)이 필요합니다.';
    const h = homeTableCount(home, away, tables);
    if ((h > 0 && home < h * 2) || (tables - h > 0 && away < (tables - h) * 2)) {
      return '테이블마다 최소 2명이 앉도록 레인 수를 줄여 주세요.';
    }
  }
  if (method === 'mixed' && (home < tables || away < tables)) {
    return '믹스팀은 양 팀 모두 테이블 수 이상 인원이 있어야 합니다.';
  }
  return null;
}

/**
 * Lays out one game. Returns player ids per lane, `laneCount` lanes long;
 * lane i and i+1 (i even) form a table.
 */
export function drawGame(
  method: ExchangeMethod,
  players: readonly ExchangePlayer[],
  settings: ExchangeSettings,
  laneCount: number,
): string[][] {
  const tables = laneCount / LANES_PER_TABLE;
  const home = players.filter((p) => p.side === 'home');
  const away = players.filter((p) => p.side === 'away');

  if (method === 'clubs') {
    const h = homeTableCount(home.length, away.length, tables);
    const homeTables = best(() => dealRounds(home, h), (t) => spread(t, settings));
    const awayTables = best(() => dealRounds(away, tables - h), (t) => spread(t, settings));
    // 우리·상대를 번갈아 앉히고, 한쪽이 테이블이 더 많으면 남는 건 뒤로.
    const ordered: ExchangePlayer[][] = [];
    for (let i = 0; i < Math.max(homeTables.length, awayTables.length); i++) {
      if (homeTables[i]) ordered.push(homeTables[i]!);
      if (awayTables[i]) ordered.push(awayTables[i]!);
    }
    return ordered.flatMap((t) => splitTable(t, false));
  }

  if (method === 'mixed') {
    // 클럽별로 따로 나눠 준 뒤 테이블 번호끼리 짝지음 — 앞 레인 우리, 뒷 레인 상대.
    const pairs = best(
      () => {
        const hs = dealRounds(home, tables);
        const as = dealRounds(away, tables);
        return hs.map((t, i) => [t, as[i]!] as const);
      },
      (ps) => spread(ps.map(([a, b]) => [...a, ...b]), settings),
    );
    return pairs.flatMap(([a, b]) => [a.map((p) => p.id), b.map((p) => p.id)]);
  }

  const mixedTables = best(() => dealRounds(players, tables), (t) => spread(t, settings));
  return mixedTables.flatMap((t) => splitTable(t, true));
}
