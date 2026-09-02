import type { LeagueSnapshot, Season } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';
import { dashboard, type DashboardRow } from '../../league/standings';
import { MAX_POINTS } from '../../league/scoring';
import { orderRoster } from '../../league/tiers';
import { byTotalPins, improvers, playerStats } from '../../league/playerStats';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  season: Season | null;
  onPickSeason: (id: string) => void;
  onRetry: () => void;
}

/**
 * 리그 메인 — the standings dashboard: who leads, and what the last played week
 * changed. Read-only for everyone.
 */
export function MainTab({ snapshot, state, error, season, onPickSeason, onRetry }: Props) {
  const { seasons, entries, players } = snapshot;
  const board = season ? dashboard(snapshot, season.id) : null;

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  const rosterOf = (teamId: string): LeaguePlayer[] =>
    orderRoster(
      entries
        .filter((e) => e.teamId === teamId)
        .map((e) => playerById.get(e.playerId))
        .filter((p): p is LeaguePlayer => p !== undefined),
      players,
    );

  // Narrowing on `season` rather than `board` so the JSX below can use it.
  if (!season || board === null) {
    return (
      <div className="screen">
        <div className="eyebrow">상주리그</div>
        <div className="title">리그 메인</div>
        <div className="blank">
          <div className="blank__title">아직 리그가 열리지 않았어요</div>
          <div className="blank__sub">운영자가 회차를 만들면 순위가 표시됩니다.</div>
        </div>
      </div>
    );
  }

  const leader = board.hasResults ? board.rows[0] : null;

  // Individual records come from every recorded score, so they appear as soon as
  // one sheet is in — before a full match result exists.
  const stats = playerStats(snapshot, season.id);
  const mvps = byTotalPins(stats).slice(0, 3);
  const risers = improvers(stats).slice(0, 3);

  return (
    <div className="screen">
      <div className="eyebrow">상주리그</div>
      <div className="rosterHead">
        <div className="rosterHead__left">
          <div className="rosterHead__titleRow">
            <div className="rosterHead__title">리그 메인</div>
          </div>
        </div>
        {board.latestWeekNo !== null && (
          <div className="count">
            <div className="count__n">{board.latestWeekNo}</div>
            <div className="count__d">주차 기준</div>
          </div>
        )}
      </div>

      {state === 'offline' && (
        <div className="notice">
          서버에 연결하지 못했어요. 마지막으로 받은 내용을 보여주는 중입니다.
          {error && <div className="notice__detail">{error}</div>}
          <button type="button" className="notice__action" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      {seasons.length > 1 && (
        <div className="pickRow">
          <span className="pickRow__label">회차</span>
          <div className="pickRow__chips">
            {seasons.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`chip${season.id === s.id ? ' chip--on' : ''}`}
                onClick={() => onPickSeason(s.id)}
              >
                {s.edition}회
                {s.isActive && <span className="chip__now">현재</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!board.hasResults ? (
        <div className="blank">
          <div className="blank__title">아직 경기 결과가 없어요</div>
          <div className="blank__sub">
            경기 점수가 입력되면 승수 순위와 주차별 변동이 표시됩니다.
          </div>
        </div>
      ) : (
        <>
          {leader && (
            <div className="leaderCard">
              <div className="leaderCard__label">선두</div>
              <div className="leaderCard__name">{leader.teamName}</div>
              <div className="leaderCard__pts">
                {leader.points}
                <span className="leaderCard__unit">승</span>
              </div>
              <div className="leaderCard__roster">
                {rosterOf(leader.teamId)
                  .map((p) => p.name)
                  .join(' · ') || '미배정'}
              </div>
            </div>
          )}

          <div className="sectionLabel">
            승수 순위
            <span className="sectionLabel__note">
              {board.latestWeekNo}주차까지 · 화살표는 전주차 대비
            </span>
          </div>

          <div className="rankList">
            {board.rows.map((row) => (
              <RankRow key={row.teamId} row={row} roster={rosterOf(row.teamId)} />
            ))}
          </div>

          <div className="hintBox hintBox--tight">
            경기당 최대 {MAX_POINTS}승 — 게임 3승 + 3게임 총점 1승. 승수가 같으면 누적득점 순.
          </div>
        </>
      )}

      {stats.length > 0 && (
        <>
          <div className="sectionLabel">
            MVP
            <span className="sectionLabel__note">실투 총점 합계</span>
          </div>
          <div className="statList">
            {mvps.map((s, i) => (
              <div className={`statRow2${i === 0 ? ' statRow2--first' : ''}`} key={s.player.id}>
                <span className="statRow2__pos">{i + 1}</span>
                <span className="statRow2__name">{s.player.name}</span>
                <span className="statRow2__sub">
                  {s.appearances}경기 · {s.games}게임 · 평균 {s.average} · 하이 {s.highGame}
                </span>
                <span className="statRow2__value">{s.totalPins}</span>
              </div>
            ))}
          </div>

          <div className="sectionLabel">
            에버 향상
            <span className="sectionLabel__note">등록 에버리지 대비</span>
          </div>
          {risers.length === 0 ? (
            <div className="empty">아직 등록 에버리지를 넘긴 선수가 없어요.</div>
          ) : (
            <div className="statList">
              {risers.map((s, i) => (
                <div className={`statRow2${i === 0 ? ' statRow2--first' : ''}`} key={s.player.id}>
                  <span className="statRow2__pos">{i + 1}</span>
                  <span className="statRow2__name">{s.player.name}</span>
                  <span className="statRow2__sub">
                    등록 {s.player.avg} → 이번 회차 {s.average}
                  </span>
                  <span className="statRow2__value statRow2__value--up">▲{s.delta}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Movement indicator: rank change on the left, points won this week on the right. */
function RankRow({ row, roster }: { row: DashboardRow; roster: readonly LeaguePlayer[] }) {
  const up = row.rankDelta !== null && row.rankDelta > 0;
  const down = row.rankDelta !== null && row.rankDelta < 0;

  return (
    <div className={`rankRow${row.rank <= 3 ? ' rankRow--podium' : ''}`}>
      <div className="rankRow__pos">
        <span className="rankRow__num">{row.rank}</span>
        <span
          className={`rankRow__move${up ? ' rankRow__move--up' : ''}${down ? ' rankRow__move--down' : ''}`}
        >
          {row.rankDelta === null ? '·' : up ? `▲${row.rankDelta}` : down ? `▼${-row.rankDelta}` : '–'}
        </span>
      </div>

      <div className="rankRow__body">
        <div className="rankRow__name">{row.teamName}</div>
        <div className="rankRow__roster">{roster.map((p) => p.name).join(' · ') || '미배정'}</div>
        <div className="rankRow__meta">
          {row.played}경기 · 게임 {row.gameWins}승 · 총점 {row.totalWins}승 · 누적{' '}
          {row.totalPins || '–'}
        </div>
      </div>

      <div className="rankRow__score">
        <div className="rankRow__pts">{row.points}</div>
        {/* Points only ever accrue, so a gain is the only movement worth an arrow. */}
        {row.pointsGained > 0 && <div className="rankRow__gain">▲{row.pointsGained}</div>}
      </div>
    </div>
  );
}
