import { useMemo, useState } from 'react';
import type { LeagueTab } from '../types';
import type { LeaguePlayer } from '../league/types';
import {
  createMatch,
  createSeason,
  deleteSeason,
  deleteMatch,
  deletePlayer,
  insertPlayers,
  appendTeam,
  assignPlayer,
  clearCaptain,
  createEmptyTeams,
  deleteTeam,
  setSeasonActive,
  setCaptain,
  saveGameScores,
  setLineup,
  updateMatch,
  updatePlayer,
  updateSeason,
  type Match,
  type ScoreEntry,
  type Season,
  type PlayerDraft,
} from '../league/api';
import { useLeague } from '../league/useLeague';
import { orderRoster } from '../league/tiers';
import { currentWeekNo, weekDays } from '../league/schedule';
import { AddPlayersSheet } from '../components/AddPlayersSheet';
import { PlayerSheet } from '../components/PlayerSheet';
import { SeasonSheet } from '../components/league/SeasonSheet';
import { MatchSheet } from '../components/league/MatchSheet';
import { ScoreSheet } from '../components/league/ScoreSheet';
import { LineupSheet } from '../components/league/LineupSheet';
import { PlayersTab } from './league/PlayersTab';
import { PlayTab } from './league/PlayTab';
import { ScheduleTab } from './league/ScheduleTab';
import { MainTab } from './league/MainTab';
import { StandingsTab } from './league/StandingsTab';
import { DrawTab } from './league/DrawTab';

interface Props {
  tab: LeagueTab;
  onGoTab: (tab: LeagueTab) => void;
  /** Signed-in operator; the session itself lives in the shared app bar. */
  isAdmin: boolean;
  onNotify: (message: string) => void;
}

export function LeagueScreen({ tab, onGoTab, isAdmin, onNotify }: Props) {
  const league = useLeague();
  const { snapshot } = league;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<LeaguePlayer | null>(null);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [matchSheet, setMatchSheet] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [recordingMatch, setRecordingMatch] = useState<Match | null>(null);
  /** 경기일정에서 조회만 하려고 연 경기. 기록용과 달리 저장 경로가 없다. */
  const [viewingMatch, setViewingMatch] = useState<Match | null>(null);
  const [lineupMatch, setLineupMatch] = useState<Match | null>(null);

  // Which 회차/주차 is on screen. Held in memory rather than persisted so a
  // newly created season becomes the selection without extra clicks.
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [weekId, setWeekId] = useState<string | null>(null);

  /**
   * The 회차 on screen: an explicit pick, else the one marked current, else the
   * first. Marking a season current is what makes every tab open on it.
   */
  const season = useMemo(
    () =>
      snapshot.seasons.find((s) => s.id === seasonId) ??
      snapshot.seasons.find((s) => s.isActive) ??
      snapshot.seasons[0] ??
      null,
    [snapshot.seasons, seasonId],
  );

  const seasonWeeks = useMemo(
    () => (season ? snapshot.weeks.filter((w) => w.seasonId === season.id) : []),
    [snapshot.weeks, season],
  );

  /**
   * Falls back to the week containing today rather than week 1, so opening the
   * tab mid-season lands on the round actually being played.
   */
  const week = useMemo(() => {
    const chosen = seasonWeeks.find((w) => w.id === weekId);
    if (chosen) return chosen;
    const nowWeek = season ? currentWeekNo(season.startDate, season.totalWeeks) : null;
    return (
      (nowWeek === null ? undefined : seasonWeeks.find((w) => w.weekNo === nowWeek)) ??
      seasonWeeks[0] ??
      null
    );
  }, [seasonWeeks, weekId, season]);

  /** The seven dates of the selected week, for the fixture day picker. */
  const days = useMemo(
    () => (season && week ? weekDays(season.startDate, week.weekNo) : []),
    [season, week],
  );

  const seasonTeams = useMemo(
    () => (season ? snapshot.teams.filter((t) => t.seasonId === season.id) : []),
    [snapshot.teams, season],
  );

  /** Teams already fixtured in the selected week; they cannot play twice. */
  const busyTeamIds = useMemo(() => {
    if (!week) return [];
    return snapshot.matches
      .filter((m) => m.weekId === week.id)
      .flatMap((m) => [m.homeTeamId, m.awayTeamId]);
  }, [snapshot.matches, week]);

  const playerById = useMemo(
    () => new Map(snapshot.players.map((p) => [p.id, p] as const)),
    [snapshot.players],
  );

  /**
   * The side as the score sheet needs it: the recorded line-up when there is
   * one, otherwise the whole squad.
   */
  const sideFor = (teamId: string, matchId: string) => {
    const team = snapshot.teams.find((t) => t.id === teamId);
    const lineup = snapshot.lineups.filter((l) => l.matchId === matchId && l.teamId === teamId);
    const ids =
      lineup.length > 0
        ? lineup.map((l) => l.playerId)
        : snapshot.entries.filter((e) => e.teamId === teamId).map((e) => e.playerId);
    return {
      teamId,
      teamName: team?.name ?? '삭제된 팀',
      roster: orderRoster(
        ids.map((id) => playerById.get(id)).filter((p): p is LeaguePlayer => p !== undefined),
        snapshot.players,
      ),
    };
  };

  /** Squad plus current line-up, for the line-up picker. */
  const squadFor = (teamId: string, matchId: string) => {
    const team = snapshot.teams.find((t) => t.id === teamId);
    const rows = snapshot.entries.filter((e) => e.teamId === teamId);
    rows.sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain));
    return {
      teamId,
      teamName: team?.name ?? '삭제된 팀',
      squad: rows
        .map((e) => playerById.get(e.playerId))
        .filter((p): p is LeaguePlayer => p !== undefined),
      captainId: rows.find((e) => e.isCaptain)?.playerId ?? null,
      playing: snapshot.lineups
        .filter((l) => l.matchId === matchId && l.teamId === teamId)
        .map((l) => l.playerId),
    };
  };

  const saveLineups = (picks: { teamId: string; playerIds: string[] }[]) =>
    lineupMatch
      ? attempt(async () => {
          for (const pick of picks) await setLineup(lineupMatch.id, pick.teamId, pick.playerIds);
        }, '출전 선수를 저장했어요')
      : Promise.resolve('경기를 찾지 못했습니다.');

  /** Wraps a write so failures come back as a message instead of throwing. */
  const attempt = async (action: () => Promise<void>, success: string): Promise<string | null> => {
    try {
      await action();
      await league.refresh();
      onNotify(success);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  // ── Player mutations ─────────────────────────────────────────
  const addPlayers = (drafts: PlayerDraft[]) =>
    attempt(() => insertPlayers(drafts), `선수 ${drafts.length}명을 등록했어요`);

  const savePlayer = (draft: PlayerDraft) =>
    editing
      ? attempt(() => updatePlayer(editing.id, draft), `${draft.name} 정보를 수정했어요`)
      : Promise.resolve(null);

  const removePlayer = async (player: LeaguePlayer): Promise<string | null> => {
    if (
      !window.confirm(
        `${player.name} 선수를 삭제할까요?\n이 선수의 경기 기록과 팀 소속도 함께 지워집니다.`,
      )
    ) {
      return null;
    }
    return attempt(() => deletePlayer(player.id), `${player.name} 선수를 삭제했어요`);
  };

  // ── Season / team / match mutations ──────────────────────────
  const addSeason = (edition: number, totalWeeks: number, title: string | null, startDate: string) =>
    attempt(
      () => createSeason(edition, totalWeeks, title, startDate),
      `${edition}회를 만들었어요 (${totalWeeks}주차)`,
    );

  const saveSeason = (edition: number, totalWeeks: number, title: string | null, startDate: string) =>
    editingSeason
      ? attempt(
          () => updateSeason(editingSeason.id, edition, totalWeeks, title, startDate),
          `${edition}회 설정을 저장했어요`,
        )
      : Promise.resolve('수정할 회차를 찾지 못했습니다.');

  const toggleSeasonActive = (target: Season, active: boolean) =>
    attempt(
      () => setSeasonActive(target.id, active),
      active ? `${target.edition}회를 현재 회차로 지정했어요` : '현재 회차 지정을 해제했어요',
    );

  const removeSeason = (season: Season) =>
    attempt(() => deleteSeason(season.id), `${season.edition}회를 삭제했어요`);

  const addMatch = (
    homeTeamId: string,
    awayTeamId: string,
    laneNo: number | null,
    playedOn: string | null,
    startTime: string | null,
  ) =>
    week
      ? attempt(
          () => createMatch(week.id, homeTeamId, awayTeamId, laneNo, playedOn, startTime),
          `${week.weekNo}주차 대진을 등록했어요`,
        )
      : Promise.resolve('주차를 먼저 선택해 주세요.');

  const saveMatch = (
    homeTeamId: string,
    awayTeamId: string,
    laneNo: number | null,
    playedOn: string | null,
    startTime: string | null,
  ) =>
    editingMatch
      ? attempt(
          () => updateMatch(editingMatch.id, homeTeamId, awayTeamId, laneNo, playedOn, startTime),
          '대진을 수정했어요',
        )
      : Promise.resolve('수정할 대진을 찾지 못했습니다.');

  const recordScores = (entries: ScoreEntry[]) =>
    recordingMatch
      ? attempt(() => saveGameScores(recordingMatch.id, entries), '경기 기록을 저장했어요')
      : Promise.resolve('기록할 대진을 찾지 못했습니다.');

  // 팀짜기 writes go straight through; each returns null on success.
  const createTeams = (teamCount: number) =>
    season
      ? attempt(() => createEmptyTeams(season.id, teamCount), `${teamCount}개 팀을 만들었어요`)
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const addOneTeam = () =>
    season
      ? attempt(
          () => appendTeam(season.id, seasonTeams.map((t) => t.name)),
          '팀을 추가했어요',
        )
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const removeOneTeam = (teamId: string) =>
    season
      ? attempt(() => deleteTeam(teamId), '팀을 삭제했어요')
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const assignToTeam = (playerId: string, teamId: string | null) =>
    season
      ? attempt(
          () => assignPlayer(season.id, playerId, teamId),
          teamId === null ? '팀에서 제외했어요' : '팀에 배정했어요',
        )
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const makeCaptain = (teamId: string, playerId: string) =>
    season
      ? attempt(() => setCaptain(season.id, teamId, playerId), '팀장을 지정했어요')
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const dropCaptain = (playerId: string) =>
    season
      ? attempt(() => clearCaptain(season.id, playerId), '팀장을 해제했어요')
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const removeMatch = (match: Match) =>
    attempt(() => deleteMatch(match.id), '대진을 삭제했어요');

  const pickSeason = (id: string) => {
    setSeasonId(id);
    setWeekId(null);
  };

  return (
    <>
      {/* 회차는 탭 위에서 한 번만 고른다 — 모든 탭이 같은 회차를 본다. */}
      {snapshot.seasons.length > 0 && (
        <div className="seasonBar">
          <span className="seasonBar__label">회차</span>
          <div className="seasonBar__chips">
            {snapshot.seasons.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`chip${season?.id === s.id ? ' chip--on' : ''}`}
                onClick={() => pickSeason(s.id)}
              >
                {s.edition}회
                {s.isActive && <span className="chip__now">현재</span>}
              </button>
            ))}
            {isAdmin && season && (
              <button
                type="button"
                className="chip chip--ghost"
                onClick={() => setEditingSeason(season)}
              >
                ⚙ 설정
              </button>
            )}
            {isAdmin && (
              <button type="button" className="chip chip--ghost" onClick={() => setSeasonSheet(true)}>
                + 회차
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'standings' && (
        <StandingsTab
          snapshot={snapshot}
          state={league.state}
          error={league.error}
          season={season}
          onRetry={() => void league.refresh()}
        />
      )}

      {tab === 'players' && (
        <PlayersTab
          snapshot={snapshot}
          state={league.state}
          error={league.error}
          isAdmin={isAdmin}
          onAdd={() => setAddOpen(true)}
          onEdit={setEditing}
          onRetry={() => void league.refresh()}
        />
      )}

      {tab === 'play' && (
        <PlayTab
          snapshot={snapshot}
          state={league.state}
          error={league.error}
          isAdmin={isAdmin}
          season={season}
          week={week}
          onPickWeek={setWeekId}
          onCreateSeason={() => setSeasonSheet(true)}
          onGoDraw={() => onGoTab('draw')}
          onCreateMatch={() => setMatchSheet(true)}
          onLineupMatch={setLineupMatch}
          onRecordMatch={setRecordingMatch}
          onEditMatch={setEditingMatch}
          onRetry={() => void league.refresh()}
        />
      )}

      {tab === 'schedule' && (
        <ScheduleTab
          snapshot={snapshot}
          state={league.state}
          error={league.error}
          season={season}
          week={week}
          onPickWeek={setWeekId}
          onViewMatch={setViewingMatch}
          onRetry={() => void league.refresh()}
        />
      )}

      {tab === 'draw' && (
        <DrawTab
          snapshot={snapshot}
          season={season}
          isAdmin={isAdmin}
          onCreateTeams={createTeams}
          onAddTeam={addOneTeam}
          onDeleteTeam={removeOneTeam}
          onAssign={assignToTeam}
          onSetCaptain={makeCaptain}
          onClearCaptain={dropCaptain}
        />
      )}

      {tab === 'main' && (
        <MainTab
          snapshot={snapshot}
          state={league.state}
          error={league.error}
          season={season}
          onRetry={() => void league.refresh()}
        />
      )}

      {addOpen && (
        <AddPlayersSheet
          existingNames={snapshot.players.map((p) => p.name)}
          onSave={addPlayers}
          onClose={() => setAddOpen(false)}
        />
      )}

      {editing && (
        <PlayerSheet
          player={editing}
          onSave={savePlayer}
          onDelete={removePlayer}
          onClose={() => setEditing(null)}
        />
      )}

      {seasonSheet && (
        <SeasonSheet
          usedEditions={snapshot.seasons.map((s) => s.edition)}
          suggestedEdition={Math.max(0, ...snapshot.seasons.map((s) => s.edition)) + 1}
          onSave={addSeason}
          onClose={() => setSeasonSheet(false)}
        />
      )}

      {editingSeason && (
        <SeasonSheet
          season={editingSeason}
          usedEditions={snapshot.seasons.map((s) => s.edition)}
          suggestedEdition={editingSeason.edition}
          onSave={saveSeason}
          onDelete={removeSeason}
          onSetActive={toggleSeasonActive}
          onClose={() => setEditingSeason(null)}
        />
      )}

      {matchSheet && week && (
        <MatchSheet
          weekNo={week.weekNo}
          days={days}
          teams={seasonTeams}
          busyTeamIds={busyTeamIds}
          onSave={addMatch}
          onClose={() => setMatchSheet(false)}
        />
      )}

      {recordingMatch && (
        <ScoreSheet
          match={recordingMatch}
          home={sideFor(recordingMatch.homeTeamId, recordingMatch.id)}
          away={sideFor(recordingMatch.awayTeamId, recordingMatch.id)}
          existing={snapshot.scores.filter((s) => s.matchId === recordingMatch.id)}
          onSave={recordScores}
          onClose={() => setRecordingMatch(null)}
        />
      )}

      {viewingMatch && (
        <ScoreSheet
          match={viewingMatch}
          home={sideFor(viewingMatch.homeTeamId, viewingMatch.id)}
          away={sideFor(viewingMatch.awayTeamId, viewingMatch.id)}
          existing={snapshot.scores.filter((s) => s.matchId === viewingMatch.id)}
          readOnly
          onClose={() => setViewingMatch(null)}
        />
      )}

      {lineupMatch && (
        <LineupSheet
          match={lineupMatch}
          home={squadFor(lineupMatch.homeTeamId, lineupMatch.id)}
          away={squadFor(lineupMatch.awayTeamId, lineupMatch.id)}
          onSave={saveLineups}
          onClose={() => setLineupMatch(null)}
        />
      )}

      {editingMatch && week && (
        <MatchSheet
          match={editingMatch}
          weekNo={week.weekNo}
          days={days}
          teams={seasonTeams}
          // The fixture's own teams must stay selectable while editing it.
          busyTeamIds={busyTeamIds.filter(
            (id) => id !== editingMatch.homeTeamId && id !== editingMatch.awayTeamId,
          )}
          onSave={saveMatch}
          onDelete={removeMatch}
          onClose={() => setEditingMatch(null)}
        />
      )}
    </>
  );
}

