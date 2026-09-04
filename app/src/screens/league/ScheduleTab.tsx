 import { useState } from 'react';
import type { LeagueSnapshot, Match, Season, Week } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';
import {
  OUTCOME_LABEL,
  outcomeFor,
  pointsFor,
  resultByMatch,
  type Outcome,
} from '../../league/standings';
import { TeamAdjust } from '../../components/league/TeamAdjust';
import { TotalLine } from '../../components/league/TotalLine';
import { orderRoster, TIER_META, type TieredPlayer } from '../../league/tiers';
import { fixtureHandicaps } from '../../league/scoring';
import {
  isCurrentWeek,
  parseDate,
  shortDate,
  WEEKDAYS,
  weekdayOf,
  weekRange,
} from '../../league/schedule';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  season: Season | null;
  week: Week | null;
  onPickWeek: (id: string) => void;
  /** Opens the record sheet read-only, so anyone can look up a night. */
  onViewMatch: (match: Match) => void;
  onRetry: () => void;
}

/**
 * 경기일정 — the participant-facing view: where the league stands, and what is
 * being played this week. Read-only for everyone; configuration lives on 경기설정.
 */
export function ScheduleTab({
  snapshot,
  state,
  error,
  season,
  week,
  onPickWeek,
  onViewMatch,
  onRetry,
}: Props) {
  const { seasons, teams, weeks, entries, players } = snapshot;
  /** null = 전체; otherwise a day index (0 = Sunday). */
  const [weekday, setWeekday] = useState<number | null>(null);

  const seasonWeeks = season ? weeks.filter((w) => w.seasonId === season.id) : [];

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  /**
   * Who to show for a team in a fixture: the recorded line-up, or the whole
   * squad before one is set. 경기일정 was showing the squad unconditionally,
   * so players who sat out still appeared.
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
  const results = season ? resultByMatch(snapshot, season.id) : new Map();

  /** 점수 합으로 정해지는 대진 핸디캡을 양 팀에 나눠준다. */
  const fixtureExtra = (matchId: string, homeId: string, awayId: string) => {
    const sum = (r: readonly LeaguePlayer[]) => r.reduce((t, p) => t + (p.avg ?? 0), 0);
    return fixtureHandicaps(sum(rosterOf(homeId, matchId)), sum(rosterOf(awayId, matchId)));
  };

  const weekMatchesAll = week
    ? snapshot.matches
        .filter((m) => m.weekId === week.id)
        .slice()
        .sort(
          (a, b) =>
            (parseDate(a.playedOn) ?? Infinity) - (parseDate(b.playedOn) ?? Infinity) ||
            (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') ||
            (a.laneNo ?? Infinity) - (b.laneNo ?? Infinity),
        )
    : [];
  const weekMatches =
    weekday === null
      ? weekMatchesAll
      : weekMatchesAll.filter((m) => weekdayOf(m.playedOn) === weekday);

  const range = season && week ? weekRange(season.startDate, week.weekNo) : null;

  if (seasons.length === 0) {
    return (
      <div className="screen">
        <div className="eyebrow">상주리그</div>
        <div className="title">경기 일정</div>
        <div className="blank">
          <div className="blank__title">아직 리그가 열리지 않았어요</div>
          <div className="blank__sub">운영자가 회차를 만들면 순위와 일정이 표시됩니다.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="eyebrow">상주리그</div>
      <div className="title">경기 일정</div>

      {state === 'offline' && (
        <div className="notice">
          서버에 연결하지 못했어요. 마지막으로 받은 내용을 보여주는 중입니다.
          {error && <div className="notice__detail">{error}</div>}
          <button type="button" className="notice__action" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      <div className="sectionLabel">
        {week ? `${week.weekNo}주차 일정` : '주차 일정'}
        {season && week && isCurrentWeek(season.startDate, week.weekNo) && (
          <span className="sectionLabel__badge">이번주</span>
        )}
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
                >
                  {w.weekNo}주
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

      {range && (
        <div className="weekRange">
          {shortDate(range.start)} ~ {shortDate(range.end)}
        </div>
      )}

      {weekMatches.length === 0 ? (
        <div className="empty">
          {!week
            ? '주차를 선택해 주세요.'
            : weekday !== null && weekMatchesAll.length > 0
              ? '이 요일에는 대진이 없어요.'
              : `${week.weekNo}주차 대진이 아직 공지되지 않았어요.`}
        </div>
      ) : (
        <div className="fixtures">
          {weekMatches.map((m) => (
            <div className="fixture" key={m.id}>
              <div className="fixture__head">
                <span className="fixture__lane">
                  {m.playedOn ? shortDate(parseDate(m.playedOn)!) : '날짜 미정'}
                  {m.startTime && <span className="fixture__time">{m.startTime}</span>}
                  <span className="fixture__laneNo">
                    {m.laneNo === null ? '레인 미정' : `${m.laneNo}번 레인`}
                  </span>
                </span>
                <span className="fixture__actions">
                  <button
                    type="button"
                    className="fixture__edit"
                    onClick={() => onViewMatch(m)}
                    aria-label="경기 상세"
                  >
                    경기상세
                    {!results.has(m.id) && <em className="fixture__badge fixture__badge--muted">기록 전</em>}
                  </button>
                </span>
              </div>
              <div className="fixture__body">
                <ScheduleSide
                  name={teamName(m.homeTeamId)}
                  roster={rosterOf(m.homeTeamId, m.id)}
                  outcome={results.has(m.id) ? outcomeFor(results.get(m.id)!, true) : null}
                  points={results.has(m.id) ? pointsFor(results.get(m.id)!, true) : null}
                  fixtureHandicap={fixtureExtra(m.id, m.homeTeamId, m.awayTeamId).home}
                />
                <div className="fixture__vs">VS</div>
                <ScheduleSide
                  name={teamName(m.awayTeamId)}
                  roster={rosterOf(m.awayTeamId, m.id)}
                  outcome={results.has(m.id) ? outcomeFor(results.get(m.id)!, false) : null}
                  points={results.has(m.id) ? pointsFor(results.get(m.id)!, false) : null}
                  fixtureHandicap={fixtureExtra(m.id, m.homeTeamId, m.awayTeamId).away}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleSide({ name, roster, outcome, points, fixtureHandicap }: {
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
      <TotalLine roster={roster} />
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
      <TeamAdjust roster={roster} fixtureHandicap={fixtureHandicap} />
    </div>
  );
}
