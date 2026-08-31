import type { LeagueSnapshot, Season, Week } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import type { LoadState } from '../../league/useLeague';
import {
  leagueTable,
  OUTCOME_LABEL,
  outcomeFor,
  pointsFor,
  resultByMatch,
  type Outcome,
} from '../../league/standings';
import { orderRoster, TIER_META, type TieredPlayer } from '../../league/tiers';
import { isCurrentWeek, parseDate, shortDate, weekRange } from '../../league/schedule';
import { MAX_POINTS } from '../../league/scoring';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  season: Season | null;
  week: Week | null;
  onPickSeason: (id: string) => void;
  onPickWeek: (id: string) => void;
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
  onPickSeason,
  onPickWeek,
  onRetry,
}: Props) {
  const { seasons, teams, weeks, entries, players } = snapshot;

  const seasonWeeks = season ? weeks.filter((w) => w.seasonId === season.id) : [];
  const table = season ? leagueTable(snapshot, season.id) : [];
  const anyPlayed = table.some((r) => r.played > 0);

  const playerById = new Map(players.map((p) => [p.id, p] as const));
  const rosterOf = (teamId: string): TieredPlayer[] =>
    orderRoster(
      entries
        .filter((e) => e.teamId === teamId)
        .map((e) => playerById.get(e.playerId))
        .filter((p): p is LeaguePlayer => p !== undefined),
      players,
    );
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '삭제된 팀';
  const results = season ? resultByMatch(snapshot, season.id) : new Map();

  const weekMatches = week
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

      {seasons.length > 1 && (
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
          </div>
        </div>
      )}

      {/* ── 순위표 ── */}
      <div className="sectionLabel">
        {season?.edition}회 순위
        {!anyPlayed && <span className="sectionLabel__note">경기 결과 입력 전</span>}
      </div>

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

      {/* ── 이번 주차 일정 ── */}
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

      {range && (
        <div className="weekRange">
          {shortDate(range.start)} ~ {shortDate(range.end)}
        </div>
      )}

      {weekMatches.length === 0 ? (
        <div className="empty">
          {week ? `${week.weekNo}주차 대진이 아직 공지되지 않았어요.` : '주차를 선택해 주세요.'}
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
              </div>
              <div className="fixture__body">
                <ScheduleSide
                  name={teamName(m.homeTeamId)}
                  roster={rosterOf(m.homeTeamId)}
                  outcome={results.has(m.id) ? outcomeFor(results.get(m.id)!, true) : null}
                  points={results.has(m.id) ? pointsFor(results.get(m.id)!, true) : null}
                />
                <div className="fixture__vs">VS</div>
                <ScheduleSide
                  name={teamName(m.awayTeamId)}
                  roster={rosterOf(m.awayTeamId)}
                  outcome={results.has(m.id) ? outcomeFor(results.get(m.id)!, false) : null}
                  points={results.has(m.id) ? pointsFor(results.get(m.id)!, false) : null}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleSide({ name, roster, outcome, points }: {
  name: string;
  roster: readonly TieredPlayer[];
  /** null until both sides' scores are in. */
  outcome: Outcome | null;
  points: string | null;
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
