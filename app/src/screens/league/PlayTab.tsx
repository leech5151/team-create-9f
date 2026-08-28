import type { LeagueSnapshot, Match, Season, Team, Week } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  isAdmin: boolean;
  season: Season | null;
  week: Week | null;
  onPickSeason: (id: string) => void;
  onPickWeek: (id: string) => void;
  onCreateSeason: () => void;
  onCreateTeam: () => void;
  onCreateMatch: () => void;
  onDeleteMatch: (match: Match) => void;
  onRetry: () => void;
}

/**
 * 경기진행 — this week's fixtures, posted by the operator and read by everyone
 * else. It is an announcement board, not a score sheet.
 */
export function PlayTab({
  snapshot,
  state,
  error,
  isAdmin,
  season,
  week,
  onPickSeason,
  onPickWeek,
  onCreateSeason,
  onCreateTeam,
  onCreateMatch,
  onDeleteMatch,
  onRetry,
}: Props) {
  const { seasons, teams, weeks, entries, players } = snapshot;

  const seasonTeams = season ? teams.filter((t) => t.seasonId === season.id) : [];
  const seasonWeeks = season ? weeks.filter((w) => w.seasonId === season.id) : [];
  const weekMatches = week ? snapshot.matches.filter((m) => m.weekId === week.id) : [];

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  const rosterOf = (teamId: string): LeaguePlayer[] =>
    entries
      .filter((e) => e.teamId === teamId)
      .map((e) => playerById.get(e.playerId))
      .filter((p): p is LeaguePlayer => p !== undefined);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '삭제된 팀';

  return (
    <div className="screen">
      <div className="eyebrow">상주리그</div>
      <div className="title">경기 진행</div>

      {state === 'offline' && (
        <div className="notice">
          서버에 연결하지 못했어요. 마지막으로 받은 내용을 보여주는 중입니다.
          {error && <div className="notice__detail">{error}</div>}
          <button type="button" className="notice__action" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      {/* ── No season yet ── */}
      {seasons.length === 0 ? (
        <div className="blank">
          <div className="blank__title">회차가 없어요</div>
          <div className="blank__sub">
            {isAdmin
              ? '회차를 만들면 주차가 자동으로 생기고, 주차별 대진을 공지할 수 있어요.'
              : '운영자가 회차를 만들면 여기에 대진이 표시됩니다.'}
          </div>
          {isAdmin && (
            <button type="button" className="blank__cta" onClick={onCreateSeason}>
              회차 만들기
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="pickRow">
            <span className="pickRow__label">회차</span>
            <div className="pickRow__chips">
              {seasons.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`chip${season?.id === s.id ? ' chip--on' : ''}`}
                  onClick={() => onPickSeason(s.id)}
                >
                  {s.edition}회
                </button>
              ))}
              {isAdmin && (
                <button type="button" className="chip chip--ghost" onClick={onCreateSeason}>
                  + 회차
                </button>
              )}
            </div>
          </div>

          {seasonWeeks.length > 0 && (
            <div className="pickRow">
              <span className="pickRow__label">주차</span>
              <div className="pickRow__chips">
                {seasonWeeks.map((w) => {
                  const count = snapshot.matches.filter((m) => m.weekId === w.id).length;
                  return (
                    <button
                      type="button"
                      key={w.id}
                      className={`chip${week?.id === w.id ? ' chip--on' : ''}`}
                      onClick={() => onPickWeek(w.id)}
                    >
                      {w.weekNo}주
                      {count > 0 && <span className="chip__badge">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="statRow">
            <div className="stat">
              <div className="stat__k">팀</div>
              <div className="stat__v">{seasonTeams.length}팀</div>
            </div>
            <div className="stat">
              <div className="stat__k">이번 주 대진</div>
              <div className="stat__v">{weekMatches.length}경기</div>
            </div>
          </div>

          {/* ── Teams missing ── */}
          {seasonTeams.length < 2 ? (
            <div className="blank">
              <div className="blank__title">팀이 아직 부족해요</div>
              <div className="blank__sub">
                대진을 만들려면 팀이 2개 이상 필요합니다. 현재 {seasonTeams.length}팀.
              </div>
              {isAdmin && (
                <button type="button" className="blank__cta" onClick={onCreateTeam}>
                  팀 만들기
                </button>
              )}
            </div>
          ) : (
            <>
              {isAdmin && (
                <div className="rosterTools">
                  <button type="button" className="addMemberBtn" onClick={onCreateMatch}>
                    <span className="addMemberBtn__plus">+</span> 대진 추가
                  </button>
                  <button type="button" className="rosterTools__toggle" onClick={onCreateTeam}>
                    팀 추가
                  </button>
                </div>
              )}

              {weekMatches.length === 0 ? (
                <div className="blank">
                  <div className="blank__title">
                    {week ? `${week.weekNo}주차 대진이 없어요` : '주차를 선택해 주세요'}
                  </div>
                  <div className="blank__sub">
                    {isAdmin
                      ? '대진을 추가하면 모든 사람이 볼 수 있어요.'
                      : '운영자가 대진을 등록하면 여기에 표시됩니다.'}
                  </div>
                </div>
              ) : (
                <div className="fixtures">
                  {weekMatches.map((m) => (
                    <div className="fixture" key={m.id}>
                      <div className="fixture__head">
                        <span className="fixture__lane">
                          {m.laneNo === null ? '레인 미정' : `${m.laneNo}번 레인`}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="fixture__del"
                            onClick={() => onDeleteMatch(m)}
                            aria-label="대진 삭제"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <div className="fixture__body">
                        <FixtureSide name={teamName(m.homeTeamId)} roster={rosterOf(m.homeTeamId)} />
                        <div className="fixture__vs">VS</div>
                        <FixtureSide name={teamName(m.awayTeamId)} roster={rosterOf(m.awayTeamId)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {seasonTeams.length > 0 && (
            <div className="teamStrip">
              {seasonTeams.map((t) => (
                <TeamChip key={t.id} team={t} roster={rosterOf(t.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FixtureSide({ name, roster }: { name: string; roster: readonly LeaguePlayer[] }) {
  return (
    <div className="fixture__side">
      <div className="fixture__team">{name}</div>
      <div className="fixture__players">
        {roster.length === 0 ? (
          <span className="fixture__empty">선수 미배정</span>
        ) : (
          roster.map((p) => (
            <span className="fixture__player" key={p.id}>
              {p.name}
              {p.handicap > 0 && <em className="fixture__adj">+{p.handicap}</em>}
              {p.penalty > 0 && <em className="fixture__adj fixture__adj--pen">−{p.penalty}</em>}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function TeamChip({ team, roster }: { team: Team; roster: readonly LeaguePlayer[] }) {
  return (
    <div className="teamChip">
      <div className="teamChip__name">{team.name}</div>
      <div className="teamChip__players">
        {roster.length === 0 ? '미배정' : roster.map((p) => p.name).join(' · ')}
      </div>
    </div>
  );
}
