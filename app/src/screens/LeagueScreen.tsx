import { useMemo, useState } from 'react';
import type { LeagueTab } from '../types';
import type { LeaguePlayer } from '../league/types';
import {
  createMatch,
  createSeason,
  createTeam,
  deleteMatch,
  deletePlayer,
  insertPlayers,
  updatePlayer,
  type Match,
  type PlayerDraft,
} from '../league/api';
import { useLeague } from '../league/useLeague';
import { AddPlayersSheet } from '../components/AddPlayersSheet';
import { PlayerSheet } from '../components/PlayerSheet';
import { SeasonSheet } from '../components/league/SeasonSheet';
import { TeamSheet } from '../components/league/TeamSheet';
import { MatchSheet } from '../components/league/MatchSheet';
import { PlayersTab } from './league/PlayersTab';
import { PlayTab } from './league/PlayTab';

interface TabSpec {
  title: string;
  blurb: string;
  planned: string[];
}

/** Tabs still to be built — stated plainly rather than mocked with fake data. */
const PLANNED: Record<'main' | 'schedule', TabSpec> = {
  main: {
    title: '리그 메인',
    blurb: '현재 시즌 순위와 최근 경기 결과를 한눈에 보는 화면입니다.',
    planned: ['시즌 순위표', '최근 경기 결과', '개인 기록 상위'],
  },
  schedule: {
    title: '경기 일정',
    blurb: '회차별 전체 일정과 주차 날짜를 관리하는 화면입니다.',
    planned: ['주차 날짜 지정', '전체 일정 한눈에 보기', '팀 구성 수정'],
  },
};

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
  const [teamSheet, setTeamSheet] = useState(false);
  const [matchSheet, setMatchSheet] = useState(false);

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

  const week = useMemo(
    () => seasonWeeks.find((w) => w.id === weekId) ?? seasonWeeks[0] ?? null,
    [seasonWeeks, weekId],
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

  /** Teams already fixtured in the selected week; they cannot play twice. */
  const busyTeamIds = useMemo(() => {
    if (!week) return [];
    return snapshot.matches
      .filter((m) => m.weekId === week.id)
      .flatMap((m) => [m.homeTeamId, m.awayTeamId]);
  }, [snapshot.matches, week]);

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
  const addSeason = (edition: number, totalWeeks: number, title: string | null) =>
    attempt(
      () => createSeason(edition, totalWeeks, title),
      `${edition}회를 만들었어요 (${totalWeeks}주차)`,
    );

  const addTeam = (name: string, playerIds: string[]) =>
    season
      ? attempt(
          () => createTeam(season.id, name, playerIds, seasonTeams.length),
          `${name}을 만들었어요`,
        )
      : Promise.resolve('회차를 먼저 만들어 주세요.');

  const addMatch = (homeTeamId: string, awayTeamId: string, laneNo: number | null) =>
    week
      ? attempt(
          () => createMatch(week.id, homeTeamId, awayTeamId, laneNo),
          `${week.weekNo}주차 대진을 등록했어요`,
        )
      : Promise.resolve('주차를 먼저 선택해 주세요.');

  const removeMatch = async (match: Match) => {
    if (!window.confirm('이 대진을 삭제할까요?')) return;
    const message = await attempt(() => deleteMatch(match.id), '대진을 삭제했어요');
    if (message) onNotify(message);
  };

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
          onCreateTeam={() => setTeamSheet(true)}
          onCreateMatch={() => setMatchSheet(true)}
          onDeleteMatch={(m) => void removeMatch(m)}
          onRetry={() => void league.refresh()}
        />
      )}

      {(tab === 'main' || tab === 'schedule') && <PlannedTab spec={PLANNED[tab]} />}

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

      {teamSheet && (
        <TeamSheet
          available={unassigned}
          suggestedName={`${seasonTeams.length + 1}팀`}
          onSave={addTeam}
          onClose={() => setTeamSheet(false)}
        />
      )}

      {matchSheet && week && (
        <MatchSheet
          weekNo={week.weekNo}
          teams={seasonTeams}
          busyTeamIds={busyTeamIds}
          onSave={addMatch}
          onClose={() => setMatchSheet(false)}
        />
      )}
    </>
  );
}

function PlannedTab({ spec }: { spec: TabSpec }) {
  return (
    <div className="screen">
      <div className="eyebrow">상주리그</div>
      <div className="title">{spec.title}</div>
      <div className="blank">
        <div className="blank__title">아직 만들지 않았어요</div>
        <div className="blank__sub">{spec.blurb}</div>
        <ul className="plannedList">
          {spec.planned.map((item) => (
            <li className="plannedList__item" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
