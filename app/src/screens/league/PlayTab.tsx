import { useState } from 'react';
import type { LeagueSnapshot, Match, Season, Week } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';
import { TeamAdjust } from '../../components/league/TeamAdjust';
import { orderRoster, teamScore, TIER_META, type TeamScore } from '../../league/tiers';
import { fixtureHandicaps } from '../../league/scoring';
import type { TieredPlayer } from '../../league/tiers';
import {
  isCurrentWeek,
  parseDate,
  shortDate,
  WEEKDAYS,
  weekdayOf,
  weekRange,
} from '../../league/schedule';
import {
  OUTCOME_LABEL,
  outcomeFor,
  pointsFor,
  resultByMatch,
  type Outcome,
} from '../../league/standings';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  isAdmin: boolean;
  season: Season | null;
  week: Week | null;
  onPickWeek: (id: string) => void;
  onCreateSeason: () => void;
  /** Sends the operator to the 팀짜기 tab, which now owns team composition. */
  onGoDraw: () => void;
  onCreateMatch: () => void;
  onLineupMatch: (match: Match) => void;
  onRecordMatch: (match: Match) => void;
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
  onPickWeek,
  onCreateSeason,
  onGoDraw,
  onCreateMatch,
  onLineupMatch,
  onRecordMatch,
  onEditMatch,
  onRetry,
}: Props) {
  const { seasons, teams, weeks, entries, players } = snapshot;
  /** null = 전체; otherwise a day index (0 = Sunday). */
  const [weekday, setWeekday] = useState<number | null>(null);

  const seasonTeams = season ? teams.filter((t) => t.seasonId === season.id) : [];
  const seasonWeeks = season ? weeks.filter((w) => w.seasonId === season.id) : [];
  // Chronological: by date, then lane, so the board reads like the night runs.
  const weekMatchesAll = week
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
  const weekMatches =
    weekday === null
      ? weekMatchesAll
      : weekMatchesAll.filter((m) => weekdayOf(m.playedOn) === weekday);

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  /**
   * Who to show for a team in a fixture: the recorded line-up, or the whole
   * squad before one is set. Always ordered 골드 → 실버 → 브론즈.
   */
  const rosterOf = (teamId: string, matchId?: string): TieredPlayer[] => {
    const lineup = matchId
      ? snapshot.lineups.filter((l) => l.matchId === matchId && l.teamId === teamId)
      : [];
    const ids =
      lineup.length > 0
        ? lineup.map((l) => l.playerId)
        : entries.filter((e) => e.teamId === teamId).map((e) => e.playerId);
    return orderRoster(
      ids.map((id) => playerById.get(id)).filter((p): p is LeaguePlayer => p !== undefined),
      players,
    );
  };

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '삭제된 팀';

  /** Completed results, so a played fixture can show 승리/패배. */
  const results = season ? resultByMatch(snapshot, season.id) : new Map();

  /** 점수 합으로 정해지는 대진 핸디캡을 양 팀에 나눠준다. */
  const fixtureExtra = (m: Match) => {
    const sum = (r: readonly LeaguePlayer[]) => r.reduce((t, p) => t + (p.avg ?? 0), 0);
    return fixtureHandicaps(sum(rosterOf(m.homeTeamId, m.id)), sum(rosterOf(m.awayTeamId, m.id)));
  };

  /** How many players are named in a fixture's line-up. */
  const lineupCount = (matchId: string) =>
    snapshot.lineups.filter((l) => l.matchId === matchId).length;

  /** How many score slots a fixture already has filled. */
  const recordedCount = (matchId: string) =>
    snapshot.scores.filter((s) => s.matchId === matchId).length;

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

          {seasonWeeks.length > 0 && (
            <div className="pickRow">
              <span className="pickRow__label">요일</span>
              <div className="pickRow__chips">
                <button
                  type="button"
                  className={`chip${weekday === null ? ' chip--on' : ''}`}
                  onClick={() => setWeekday(null)}
                >
                  전체
                </button>
                {WEEKDAYS.map((w) => {
                  const count = weekMatchesAll.filter((m) => weekdayOf(m.playedOn) === w.day).length;
                  return (
                    <button
                      type="button"
                      key={w.day}
                      className={`chip${weekday === w.day ? ' chip--on' : ''}`}
                      onClick={() => setWeekday(weekday === w.day ? null : w.day)}
                    >
                      {w.label}
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
              <div className="notice__detail">
                {isAdmin
                  ? '위 회차 줄의 ⚙ 설정에서 1주차 시작일을 정하면 주차 날짜와 요일이 매겨집니다.'
                  : '운영자가 시작 날짜를 정하면 표시됩니다.'}
              </div>
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
                <button type="button" className="blank__cta" onClick={onGoDraw}>
                  팀짜기로 이동
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
                </div>
              )}

              {weekMatches.length === 0 ? (
                <div className="blank">
                  <div className="blank__title">
                    {!week
                      ? '주차를 선택해 주세요'
                      : weekday !== null && weekMatchesAll.length > 0
                        ? '이 요일에는 대진이 없어요'
                        : `${week.weekNo}주차 대진이 없어요`}
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
                          <span className="fixture__actions">
                            <button
                              type="button"
                              className={`fixture__edit${lineupCount(m.id) > 0 ? ' fixture__edit--done' : ''}`}
                              onClick={() => onLineupMatch(m)}
                              aria-label="출전 선수"
                            >
                              출전
                              {lineupCount(m.id) > 0 && (
                                <em className="fixture__badge">{lineupCount(m.id)}</em>
                              )}
                            </button>
                            <button
                              type="button"
                              className={`fixture__edit${recordedCount(m.id) > 0 ? ' fixture__edit--done' : ''}`}
                              onClick={() => onRecordMatch(m)}
                              aria-label="경기 기록"
                            >
                              경기기록
                              {recordedCount(m.id) > 0 && (
                                <em className="fixture__badge">{recordedCount(m.id)}</em>
                              )}
                            </button>
                            <button
                              type="button"
                              className="fixture__edit"
                              onClick={() => onEditMatch(m)}
                              aria-label="대진 수정"
                            >
                              수정
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="fixture__body">
                        <FixtureSide
                          name={teamName(m.homeTeamId)}
                          roster={rosterOf(m.homeTeamId, m.id)}
                          outcome={results.has(m.id) ? outcomeFor(results.get(m.id)!, true) : null}
                          points={results.has(m.id) ? pointsFor(results.get(m.id)!, true) : null}
                          fixtureHandicap={fixtureExtra(m).home}
                        />
                        <div className="fixture__vs">VS</div>
                        <FixtureSide
                          name={teamName(m.awayTeamId)}
                          roster={rosterOf(m.awayTeamId, m.id)}
                          outcome={results.has(m.id) ? outcomeFor(results.get(m.id)!, false) : null}
                          points={results.has(m.id) ? pointsFor(results.get(m.id)!, false) : null}
                          fixtureHandicap={fixtureExtra(m).away}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </>
      )}
    </div>
  );
}

/**
 * The line-up's raw 점수 total. The handicap and penalty used to sit beside it
 * in parentheses, but `TeamAdjust` prints the same figures directly below —
 * so this stays the scratch number only.
 */
function TotalLine({ score }: { score: TeamScore }) {
  const partial = score.scored < score.size;
  return (
    <div className="totalLine" title="팀 원점수 합계">
      <span className="totalLine__base">{score.scored === 0 ? '–' : score.base}</span>
      {partial && score.scored > 0 && (
        <span className="totalLine__warn">{score.size - score.scored}명 점수 없음</span>
      )}
    </div>
  );
}

function FixtureSide({ name, roster, outcome, points, fixtureHandicap }: {
  name: string;
  roster: readonly TieredPlayer[];
  /** null until both sides' scores are in. */
  outcome: Outcome | null;
  points: string | null;
  fixtureHandicap: number;
}) {
  return (
    <div className="fixture__side">
      <div className="fixture__teamRow">
        <div className="fixture__team">{name}</div>
        {outcome && (
          <div className={`outcome outcome--${outcome}`}>
            <span className="outcome__label">{OUTCOME_LABEL[outcome]}</span>
            {points && <span className="outcome__pts">{points}</span>}
          </div>
        )}
      </div>
      <TotalLine score={teamScore(roster)} />
      <TeamAdjust roster={roster} fixtureHandicap={fixtureHandicap} />
      <div className="fixture__players">
        {roster.length === 0 ? (
          <span className="fixture__empty">선수 미배정</span>
        ) : (
          roster.map((p) => (
            <span className="fixture__player" key={p.id}>
              {p.tier && (
                <em className="fixture__tier" style={{ background: TIER_META[p.tier].color }} />
              )}
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
