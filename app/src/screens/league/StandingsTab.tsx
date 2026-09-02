import type { LeagueSnapshot, Season } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';
import { leagueTable } from '../../league/standings';
import { orderRoster } from '../../league/tiers';
import { MATCH_HANDICAP_MAX, MATCH_HANDICAP_STEP, MAX_POINTS } from '../../league/scoring';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  season: Season | null;
  onRetry: () => void;
}

/** 경기순위 — the league table on its own tab, read-only for everyone. */
export function StandingsTab({ snapshot, state, error, season, onRetry }: Props) {
  const { seasons, entries, players } = snapshot;
  const table = season ? leagueTable(snapshot, season.id) : [];
  const anyPlayed = table.some((r) => r.played > 0);

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  const rosterOf = (teamId: string) =>
    orderRoster(
      entries
        .filter((e) => e.teamId === teamId)
        .map((e) => playerById.get(e.playerId))
        .filter((p): p is LeaguePlayer => p !== undefined),
      players,
    );

  if (seasons.length === 0) {
    return (
      <div className="screen">
        <div className="eyebrow">상주리그</div>
        <div className="title">경기 순위</div>
        <div className="blank">
          <div className="blank__title">아직 리그가 열리지 않았어요</div>
          <div className="blank__sub">운영자가 회차를 만들면 순위가 표시됩니다.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="eyebrow">상주리그</div>
      <div className="rosterHead">
        <div className="rosterHead__left">
          <div className="rosterHead__titleRow">
            <div className="rosterHead__title">경기 순위</div>
          </div>
        </div>
        {!anyPlayed && <div className="count__d">경기 결과 입력 전</div>}
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

      {table.length === 0 ? (
        <div className="empty">팀이 등록되면 순위표가 표시됩니다.</div>
      ) : (
        <div className="tableWrap">
          <table className="ltable">
            <thead>
              <tr>
                <th className="ltable__rank">#</th>
                <th className="ltable__team">팀</th>
                <th>경기</th>
                <th>게임승</th>
                <th>총점승</th>
                <th className="ltable__pts">승점</th>
                <th className="ltable__pins">누적득점</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.teamId} className={i < 3 && anyPlayed ? 'ltable__row--top' : undefined}>
                  <td className="ltable__rank">{i + 1}</td>
                  <td className="ltable__team">
                    <div className="ltable__name">{row.teamName}</div>
                    <div className="ltable__roster">
                      {rosterOf(row.teamId)
                        .map((p) => p.name)
                        .join(' · ') || '미배정'}
                    </div>
                  </td>
                  <td>{row.played}</td>
                  <td>{row.gameWins}</td>
                  <td>{row.totalWins}</td>
                  <td className="ltable__pts">{row.points}</td>
                  <td className="ltable__pins">{row.totalPins || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="hintBox hintBox--tight">
        경기당 최대 {MAX_POINTS}승 — 게임 3승 + 3게임 총점 1승. 승점이 같으면 누적득점 순.
      </div>
      <div className="hintBox hintBox--tight">
        대진 핸디캡: 양 팀 점수 합 차이만큼 약팀에 가산 · {MATCH_HANDICAP_STEP} 단위 ·
        최대 {MATCH_HANDICAP_MAX} · {MATCH_HANDICAP_STEP} 미만은 없음
      </div>
    </div>
  );
}
