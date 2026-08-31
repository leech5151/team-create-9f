import { useMemo, useState } from 'react';
import type { LeagueTab } from '../types';
import type { LeaguePlayer } from '../league/types';
import {
  createMatch,
  createSeason,
  createTeam,
  deleteSeason,
  deleteMatch,
  deletePlayer,
  deleteTeam,
  insertPlayers,
  saveGameScores,
  updateMatch,
  updatePlayer,
  updateSeason,
  updateTeam,
  type Match,
  type ScoreEntry,
  type Season,
  type Team,
  type PlayerDraft,
} from '../league/api';
import { useLeague } from '../league/useLeague';
import { orderRoster } from '../league/tiers';
import { currentWeekNo, weekDays } from '../league/schedule';
import { AddPlayersSheet } from '../components/AddPlayersSheet';
import { PlayerSheet } from '../components/PlayerSheet';
import { SeasonSheet } from '../components/league/SeasonSheet';
import { TeamSheet } from '../components/league/TeamSheet';
import { MatchSheet } from '../components/league/MatchSheet';
import { ScoreSheet } from '../components/league/ScoreSheet';
import { PlayersTab } from './league/PlayersTab';
import { PlayTab } from './league/PlayTab';
import { ScheduleTab } from './league/ScheduleTab';
import { MainTab } from './league/MainTab';

interface Props {
  tab: LeagueTab;
  /** Signed-in operator; the session itself lives in the shared app bar. */
  isAdmin: boolean;
  onNotify: (message: string) => void;
}

export function LeagueScreen({ tab, isAdmin, onNotify }: Props) {
  const league = useLeague();
  const { snapshot } = league;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<LeaguePlayer | null>(null);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [teamSheet, setTeamSheet] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [matchSheet, setMatchSheet] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [recordingMatch, setRecordingMatch] = useState<Match | null>(null);

  // Which 회차/주차 is on screen. Held in memory rather than persisted so a
  // newly created season becomes the selection without extra clicks.
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [weekId, setWeekId] = useState<string | null>(null);

  const season = useMemo(
    () => snapshot.seasons.find((s) => s.id === seasonId) ?? snapshot.seasons[0] ?? null,
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

  /** Players with no team this season — the pool a new team can draw from. */
  const unassigned = useMemo(() => {
    if (!season) return snapshot.players;
    const taken = new Set(
      snapshot.entries
        .filter((e) => e.seasonId === season.id && e.teamId !== null)
        .map((e) => e.playerId),
    );
    return snapshot.players.filter((p) => !taken.has(p.id));
  }, [snapshot.players, snapshot.entries, season]);

  /** Current members of the team being edited, in roster order. */
  const editingMemberIds = useMemo(() => {
    if (!editingTeam) return [];
    return snapshot.entries
      .filter((e) => e.teamId === editingTeam.id)
      .map((e) => e.playerId);
  }, [snapshot.entries, editingTeam]);

  /**
   * Editing must offer the team's own members too, not just free agents —
   * otherwise reopening the sheet would show an empty selection.
   */
  const editablePool = useMemo(() => {
    if (!editingTeam) return unassigned;
    const own = new Set(editingMemberIds);
    return [...snapshot.players.filter((p) => own.has(p.id)), ...unassigned];
  }, [snapshot.players, unassigned, editingTeam, editingMemberIds]);

  /** Teams already fixtured in the selected week; they cannot play twice. */
  const busyTeamIds = useMemo(() => {
    if (!week) return [];
    return snapshot.matches
      .filter((m) => m.weekId === week.id)
      .flatMap((m) => [m.homeTeamId, m.awayTeamId]);
  }, [snapshot.matches, week]);

  /** Team name plus roster, as the score sheet needs it. */
  const sideFor = (teamId: string) => {
    const team = snapshot.teams.find((t) => t.id === teamId);
    const byId = new Map(snapshot.players.map((p) => [p.id, p] as const));
    return {
      teamId,
      teamName: team?.name ?? '삭제된 팀',
      roster: orderRoster(
        snapshot.entries
          .filter((e) => e.teamId === teamId)
          .map((e) => byId.get(e.playerId))
          .filter((p): p is LeaguePlayer => p !== undefined),
        snapshot.players,
      ),
    };
  };

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

  const removeSeason = (season: Season) =>
    attempt(() => deleteSeason(season.id), `${season.edition}회를 삭제했어요`);

  const addTeam = (name: string, playerIds: string[]) =>
    season
      ? attempt(
          () => createTeam(season.id, name, playerIds, seasonTeams.length),
          `${name}을 만들었어요`,
        )
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const saveTeam = (name: string, playerIds: string[]) =>
    editingTeam && season
      ? attempt(
          () => updateTeam(editingTeam.id, season.id, name, playerIds),
          `${name} 정보를 수정했어요`,
        )
      : Promise.resolve('수정할 팀을 찾지 못했습니다.');

  const removeTeam = (team: Team) =>
    attempt(() => deleteTeam(team.id), `${team.name}을 삭제했어요`);

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

  const removeMatch = (match: Match) =>
    attempt(() => deleteMatch(match.id), '대진을 삭제했어요');

  return (
    <>
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
          onPickSeason={(id) => {
            setSeasonId(id);
            setWeekId(null);
          }}
          onPickWeek={setWeekId}
          onCreateSeason={() => setSeasonSheet(true)}
          onEditSeason={setEditingSeason}
          onCreateTeam={() => setTeamSheet(true)}
          onEditTeam={setEditingTeam}
          onCreateMatch={() => setMatchSheet(true)}
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
          onPickSeason={(id) => {
            setSeasonId(id);
            setWeekId(null);
          }}
          onPickWeek={setWeekId}
          onRetry={() => void league.refresh()}
        />
      )}

      {tab === 'main' && (
        <MainTab
          snapshot={snapshot}
          state={league.state}
          error={league.error}
          season={season}
          onPickSeason={(id) => {
            setSeasonId(id);
            setWeekId(null);
          }}
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
          onClose={() => setEditingSeason(null)}
        />
      )}

      {teamSheet && (
        <TeamSheet
          available={unassigned}
          suggestedName={`${seasonTeams.length + 1}팀`}
          onSave={addTeam}
          onClose={() => setTeamSheet(false)}
        />
      )}

      {editingTeam && (
        <TeamSheet
          team={editingTeam}
          available={editablePool}
          initialPlayerIds={editingMemberIds}
          suggestedName={editingTeam.name}
          onSave={saveTeam}
          onDelete={removeTeam}
          onClose={() => setEditingTeam(null)}
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
          home={sideFor(recordingMatch.homeTeamId)}
          away={sideFor(recordingMatch.awayTeamId)}
          existing={snapshot.scores.filter((s) => s.matchId === recordingMatch.id)}
          onSave={recordScores}
          onClose={() => setRecordingMatch(null)}
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

