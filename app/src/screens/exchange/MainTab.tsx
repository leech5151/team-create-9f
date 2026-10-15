import { useMemo } from 'react';
import type { LoadState } from '../../league/useLeague';
import {
  EXCHANGE_SIDES,
  handicapOf,
  teamName,
  type ExchangePlayer,
  type ExchangeSide,
  type ExchangeSnapshot,
} from '../../exchange/api';
import { methodLabel } from '../../exchange/draw';
import { clubTallies, compareTally, type Tally } from '../../exchange/tables';

interface Props {
  snapshot: ExchangeSnapshot;
  state: LoadState;
  error: string | null;
  onRetry: () => void;
  onOpenPlay: () => void;
}

const RANK_LIMIT = 10;

interface GameRow {
  no: number;
  method: string;
  clubs: Record<ExchangeSide, Tally>;
  /** Every placed player has a score — only then does the game count as won. */
  done: boolean;
  winner: ExchangeSide | 'draw' | null;
}

interface PlayerLine {
  player: ExchangePlayer;
  games: number;
  /** Pins plus handicap over the games played. */
  total: number;
  avg: number;
  high: number;
}

/**
 * 교류전 한눈에 — 클럽 총점과 게임 승수, 게임별 결과, 개인 순위.
 *
 * 승부는 게임마다 클럽 총점(핸디 포함)으로 가르고, 점수가 다 들어온 게임만
 * 승수에 센다. 진행 중인 게임은 총점에만 더해진다.
 */
export function MainTab({ snapshot, state, error, onRetry, onOpenPlay }: Props) {
  const { settings, players } = snapshot;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p] as const)), [players]);
  const drawn = useMemo(() => snapshot.games.filter((g) => g.lanes.length > 0), [snapshot.games]);

  const rows = useMemo<GameRow[]>(
    () =>
      drawn.map((g) => {
        const clubs = clubTallies(g, byId, settings);
        const done =
          clubs.home.entered + clubs.away.entered === clubs.home.count + clubs.away.count &&
          clubs.home.count + clubs.away.count > 0;
        const diff = compareTally(clubs.home, clubs.away);
        const winner = !done ? null : diff === 0 ? 'draw' : diff > 0 ? 'home' : 'away';
        return { no: g.no, method: methodLabel(g.method), clubs, done, winner };
      }),
    [drawn, byId, settings],
  );

  const totals = useMemo(() => {
    const sum = (side: ExchangeSide, key: 'total' | 'handicap') =>
      rows.reduce((n, r) => n + r.clubs[side][key], 0);
    const wins = (side: ExchangeSide) => rows.filter((r) => r.winner === side).length;
    const club = (side: ExchangeSide) => ({
      total: sum(side, 'total'),
      handicap: sum(side, 'handicap'),
      wins: wins(side),
    });
    return {
      home: club('home'),
      away: club('away'),
      draws: rows.filter((r) => r.winner === 'draw').length,
    };
  }, [rows]);

  const ranking = useMemo<PlayerLine[]>(() => {
    const lines: PlayerLine[] = [];
    for (const p of players) {
      const scores = drawn
        .map((g) => g.scores[p.id])
        .filter((v): v is number => v !== undefined)
        .map((v) => v + handicapOf(p, settings));
      if (scores.length === 0) continue;
      const total = scores.reduce((a, b) => a + b, 0);
      lines.push({
        player: p,
        games: scores.length,
        total,
        avg: Math.round(total / scores.length),
        high: Math.max(...scores),
      });
    }
    return lines.sort((a, b) => b.avg - a.avg || b.high - a.high).slice(0, RANK_LIMIT);
  }, [players, drawn, settings]);

  const anyScore = rows.some((r) => r.clubs.home.entered + r.clubs.away.entered > 0);
  const leadDiff = compareTally(totals.home, totals.away);
  const lead: ExchangeSide | null = !anyScore || leadDiff === 0 ? null : leadDiff > 0 ? 'home' : 'away';
  const count = (side: ExchangeSide) => players.filter((p) => p.side === side).length;

  return (
    <div className="screen">
      <div className="eyebrow">교류전</div>
      <div className="exVs">
        {teamName('home', settings)} <em>vs</em> {teamName('away', settings)}
      </div>

      {state === 'loading' && players.length === 0 && (
        <div className="notice notice--calm">불러오는 중…</div>
      )}
      {state === 'offline' && (
        <div className="notice">
          서버에 연결하지 못했어요.
          {error && <div className="notice__detail">{error}</div>}
          <button type="button" className="notice__action" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      <div className="exBoard">
        {EXCHANGE_SIDES.map((side) => (
          <div
            key={side}
            className={`exBoard__side exBoard__side--${side}${lead === side ? ' exBoard__side--lead' : ''}`}
          >
            <div className="exBoard__name">
              <span className={`exDot exDot--${side}`} />
              {teamName(side, settings)}
            </div>
            <div className="exBoard__total">{anyScore ? totals[side].total : '–'}</div>
            <div className="exBoard__meta">
              {totals[side].wins}승 · {count(side)}명
            </div>
          </div>
        ))}
      </div>

      <div className="statRow statRow--three">
        <div className="stat">
          <div className="stat__k">게임</div>
          <div className="stat__v">
            {rows.filter((r) => r.done).length}/{snapshot.games.length}
          </div>
        </div>
        <div className="stat">
          <div className="stat__k">무승부</div>
          <div className="stat__v">{totals.draws}</div>
        </div>
        <div className="stat">
          <div className="stat__k">여성 핸디</div>
          <div className="stat__v">
            {settings.femaleHandicapOn ? `+${settings.femaleHandicap}` : '미적용'}
          </div>
        </div>
      </div>

      <div className="exSection">게임별 결과</div>
      {rows.length === 0 ? (
        <div className="hintBox">아직 짜인 게임이 없어요. 경기설정에서 팀을 짜면 여기에 표시됩니다.</div>
      ) : (
        <div className="card">
          {rows.map((r) => (
            <button type="button" className="exGameRow" key={r.no} onClick={onOpenPlay}>
              <div className="exGameRow__no">
                GAME {r.no}
                <em>{r.method}</em>
              </div>
              <div className={`exGameRow__score${r.winner === 'home' ? ' exGameRow__score--win' : ''}`}>
                {r.clubs.home.entered > 0 ? r.clubs.home.total : '–'}
              </div>
              <div className="exGameRow__colon">:</div>
              <div className={`exGameRow__score${r.winner === 'away' ? ' exGameRow__score--win' : ''}`}>
                {r.clubs.away.entered > 0 ? r.clubs.away.total : '–'}
              </div>
              <div className="exGameRow__state">
                {r.winner === 'draw'
                  ? '무승부'
                  : r.winner
                    ? `${teamName(r.winner, settings)} 승`
                    : `진행 ${r.clubs.home.entered + r.clubs.away.entered}/${r.clubs.home.count + r.clubs.away.count}`}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="exSection">개인 순위 · 평균 (핸디 포함)</div>
      {ranking.length === 0 ? (
        <div className="hintBox">점수가 입력되면 개인 순위가 나옵니다.</div>
      ) : (
        <div className="card">
          {ranking.map((line, i) => (
            <div className="exRank" key={line.player.id}>
              <div className={`exRank__no${i < 3 ? ' exRank__no--top' : ''}`}>{i + 1}</div>
              <span className={`exDot exDot--${line.player.side}`} />
              <div className="exRank__name">{line.player.name}</div>
              <div className="exRank__meta">
                {line.games}G · 하이 {line.high}
              </div>
              <div className="exRank__avg">{line.avg}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
