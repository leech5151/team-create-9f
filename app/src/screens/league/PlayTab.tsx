import type { LeagueSnapshot, Match, Season, Team, Week } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';
import { teamScore, type TeamScore } from '../../league/tiers';
import { isCurrentWeek, parseDate, shortDate, weekRange } from '../../league/schedule';

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
  onEditSeason: (season: Season) => void;
  onCreateTeam: () => void;
  onEditTeam: (team: Team) => void;
  onCreateMatch: () => void;
  onEditMatch: (match: Match) => void;
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
  onEditSeason,
  onCreateTeam,
  onEditTeam,
  onCreateMatch,
  onEditMatch,
  onRetry,
}: Props) {
  const { seasons, teams, weeks, entries, players } = snapshot;

  const seasonTeams = season ? teams.filter((t) => t.seasonId === season.id) : [];
  const seasonWeeks = season ? weeks.filter((w) => w.seasonId === season.id) : [];
  // Chronological: by date, then lane, so the board reads like the night runs.
  const weekMatches = week
    ? snapshot.matches
        .filter((m) => m.weekId === week.id)
        .slice()
        .sort(
          (a, b) =>
            (parseDate(a.playedOn) ?? Infinity) - (parseDate(b.playedOn) ?? Infinity) ||
            // Times sort lexically because they are zero-padded `HH:MM`.
            (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') ||
            (a.laneNo ?? Infinity) - (b.laneNo ?? Infinity),
        )
    : [];

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
              {isAdmin && season && (
                <button
                  type="button"
                  className="chip chip--ghost"
                  onClick={() => onEditSeason(season)}
                >
                  ⚙ {season.edition}회 설정
                </button>
              )}
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
                  const now = isCurrentWeek(season?.startDate ?? null, w.weekNo);
                  return (
                    <button
                      type="button"
                      key={w.id}
                      className={`chip${week?.id === w.id ? ' chip--on' : ''}${now ? ' chip--now' : ''}`}
                      onClick={() => onPickWeek(w.id)}
                      title={
                        weekRange(season?.startDate ?? null, w.weekNo)
                          ? `${shortDate(weekRange(season!.startDate, w.weekNo)!.start)} ~ ${shortDate(weekRange(season!.startDate, w.weekNo)!.end)}`
                          : undefined
                      }
                    >
                      {w.weekNo}주
                      {now && <span className="chip__now">이번주</span>}
                      {count > 0 && <span className="chip__badge">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {season && !season.startDate && (
            <div className="notice">
              시작 날짜가 없어 주차가 며칠부터인지 계산할 수 없습니다.
              {isAdmin ? (
                <>
                  <div className="notice__detail">
                    회차 설정에서 1주차 시작일을 정하면 주차 날짜와 요일이 매겨집니다.
                  </div>
                  <button
                    type="button"
                    className="notice__action"
                    onClick={() => onEditSeason(season)}
                  >
                    시작 날짜 설정
                  </button>
                </>
              ) : (
                <div className="notice__detail">운영자가 시작 날짜를 정하면 표시됩니다.</div>
              )}
            </div>
          )}

          {week && weekRange(season?.startDate ?? null, week.weekNo) && (
            <div className="weekRange">
              {week.weekNo}주차 ·{' '}
              {shortDate(weekRange(season!.startDate, week.weekNo)!.start)} ~{' '}
              {shortDate(weekRange(season!.startDate, week.weekNo)!.end)}
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
                          {m.playedOn ? shortDate(parseDate(m.playedOn)!) : '날짜 미정'}
                          {m.startTime && (
                            <span className="fixture__time">{m.startTime}</span>
                          )}
                          <span className="fixture__laneNo">
                            {m.laneNo === null ? '레인 미정' : `${m.laneNo}번 레인`}
                          </span>
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="fixture__edit"
                            onClick={() => onEditMatch(m)}
                            aria-label="대진 수정"
                          >
                            수정
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
            <>
              <div className="sectionLabel">팀 구성</div>
              <div className="teamStrip">
                {seasonTeams.map((t) => (
                  <TeamChip
                    key={t.id}
                    team={t}
                    roster={rosterOf(t.id)}
                    editable={isAdmin}
                    onEdit={() => onEditTeam(t)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TotalLine({ score }: { score: TeamScore }) {
  const partial = score.scored < score.size;
  return (
    <div className="totalLine" title="팀 원점수 합계 (핸디 · 패널티)">
      <span className="totalLine__base">{score.scored === 0 ? '–' : score.base}</span>
      {(score.handicap > 0 || score.penalty > 0) && (
        <span className="totalLine__adj">
          (
          {score.handicap > 0 && <em className="totalLine__h">+{score.handicap}</em>}
          {score.penalty > 0 && <em className="totalLine__p">−{score.penalty}</em>})
        </span>
      )}
      {partial && score.scored > 0 && (
        <span className="totalLine__warn">{score.size - score.scored}명 점수 없음</span>
      )}
    </div>
  );
}

function FixtureSide({ name, roster }: { name: string; roster: readonly LeaguePlayer[] }) {
  return (
    <div className="fixture__side">
      <div className="fixture__team">{name}</div>
      <TotalLine score={teamScore(roster)} />
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

function TeamChip({
  team,
  roster,
  editable,
  onEdit,
}: {
  team: Team;
  roster: readonly LeaguePlayer[];
  editable: boolean;
  onEdit: () => void;
}) {
  const body = (
    <>
      <div className="teamChip__head">
        <span className="teamChip__name">{team.name}</span>
        {editable && <span className="teamChip__edit">수정</span>}
      </div>
      <TotalLine score={teamScore(roster)} />
      <div className="teamChip__players">
        {roster.length === 0 ? '미배정' : roster.map((p) => p.name).join(' · ')}
      </div>
    </>
  );

  return editable ? (
    <button type="button" className="teamChip teamChip--btn" onClick={onEdit}>
      {body}
    </button>
  ) : (
    <div className="teamChip">{body}</div>
  );
}
