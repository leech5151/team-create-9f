import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueSnapshot, Season, Team } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import { shuffle } from '../../lib/assign';
import { teamScore } from '../../league/tiers';
import { TeamAdjust } from '../../components/league/TeamAdjust';
import { TeamMemberSheet } from '../../components/league/TeamMemberSheet';
import { ClaimSheet } from '../../components/league/ClaimSheet';
import { RandomAssignSheet } from '../../components/league/RandomAssignSheet';

interface Props {
  snapshot: LeagueSnapshot;
  season: Season | null;
  isAdmin: boolean;
  onCreateTeams: (count: number) => Promise<string | null>;
  onAddTeam: () => Promise<string | null>;
  onDeleteTeam: (teamId: string) => Promise<string | null>;
  onRenameTeam: (teamId: string, name: string) => Promise<string | null>;
  onAssign: (playerId: string, teamId: string | null) => Promise<string | null>;
  onSetCaptain: (teamId: string, playerId: string) => Promise<string | null>;
  onClearCaptain: (playerId: string) => Promise<string | null>;
}

const DEFAULT_TEAMS = 4;

/**
 * Deferred players are a property of the drawing session, not the league, so
 * they live in local storage rather than the database — but keyed by season so
 * reloading mid-draw does not put everyone back in the hat.
 */
const deferKey = (seasonId: string) => `nineframe/deferred/${seasonId}`;

/** Slot-machine timings: how fast names flick past, and for how long. */
const SPIN_TICK_MS = 70;
const SPIN_DURATION_MS = 1400;

function readDeferred(seasonId: string): Set<string> {
  try {
    const raw = localStorage.getItem(deferKey(seasonId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * 상주리그 팀짜기 — team count, captains, then a hand-placed random draw.
 *
 * Every action writes straight to the database rather than building a draft in
 * memory, so a half-finished draw survives leaving the screen or a reload.
 * There is no team size limit: league teams can be any size.
 */
export function DrawTab({
  snapshot,
  season,
  isAdmin,
  onCreateTeams,
  onAddTeam,
  onDeleteTeam,
  onRenameTeam,
  onAssign,
  onSetCaptain,
  onClearCaptain,
}: Props) {
  const { players, teams, entries } = snapshot;

  const [count, setCount] = useState(DEFAULT_TEAMS);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  /** Open once a drawn player is being claimed. */
  const [claiming, setClaiming] = useState(false);
  /** Open while picking which teams compete for the drawn player. */
  const [rolling, setRolling] = useState(false);
  /** Name flashing past while the draw spins; null when idle. */
  const [flash, setFlash] = useState<string | null>(null);
  const spinTimers = useRef<{ tick?: number; stop?: number }>({});
  /** Players held back from the draw until 반려 복귀. */
  const [deferred, setDeferred] = useState<Set<string>>(() =>
    season ? readDeferred(season.id) : new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seasonTeams = useMemo(
    () => (season ? teams.filter((t) => t.seasonId === season.id) : []),
    [teams, season],
  );
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p] as const)), [players]);

  const seasonEntries = useMemo(
    () => (season ? entries.filter((e) => e.seasonId === season.id) : []),
    [entries, season],
  );

  const membersOf = (teamId: string): LeaguePlayer[] => {
    const rows = seasonEntries.filter((e) => e.teamId === teamId);
    // Captain first so the card reads top-down.
    rows.sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain));
    return rows
      .map((e) => byId.get(e.playerId))
      .filter((p): p is LeaguePlayer => p !== undefined);
  };

  const captainOf = (teamId: string): string | null =>
    seasonEntries.find((e) => e.teamId === teamId && e.isCaptain)?.playerId ?? null;

  const assignedIds = new Set(
    seasonEntries.filter((e) => e.teamId !== null).map((e) => e.playerId),
  );
  const unassigned = players.filter((p) => !assignedIds.has(p.id));
  /** Only these can come out of the hat; deferred players sit out. */
  const drawPool = unassigned.filter((p) => !deferred.has(p.id));
  const deferredPlayers = unassigned.filter((p) => deferred.has(p.id));

  const persistDeferred = (next: Set<string>) => {
    setDeferred(next);
    if (!season) return;
    try {
      localStorage.setItem(deferKey(season.id), JSON.stringify([...next]));
    } catch {
      // Non-persistent hold is still better than none.
    }
  };

  const defer = () => {
    if (!drawn) return;
    const next = new Set(deferred);
    next.add(drawn);
    persistDeferred(next);
    setDrawn(null);
  };

  const restoreDeferred = () => persistDeferred(new Set());

  const stopSpin = () => {
    const t = spinTimers.current;
    if (t.tick !== undefined) clearInterval(t.tick);
    if (t.stop !== undefined) clearTimeout(t.stop);
    spinTimers.current = {};
  };

  // A spin left running after the tab closes would set state on a dead component.
  useEffect(() => stopSpin, []);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    const message = await action();
    setBusy(false);
    setError(message);
    return message === null;
  };

  const makeTeams = async () => {
    if (seasonTeams.length > 0) {
      if (
        !window.confirm(
          `기존 ${seasonTeams.length}개 팀과 그 대진이 모두 삭제되고 빈 ${count}개 팀으로 다시 시작합니다.\n계속할까요?`,
        )
      ) {
        return;
      }
    }
    await run(() => onCreateTeams(count));
  };

  /**
   * Picks the winner up front, then rolls other names past for effect before
   * revealing it. Deciding first keeps the result independent of how the
   * animation happens to land.
   */
  const draw = () => {
    if (drawPool.length === 0) return;
    const target = shuffle(drawPool)[0]!;
    stopSpin();
    setDrawn(null);
    setFlash(target.name);

    spinTimers.current.tick = window.setInterval(() => {
      setFlash(drawPool[Math.floor(Math.random() * drawPool.length)]!.name);
    }, SPIN_TICK_MS);

    spinTimers.current.stop = window.setTimeout(() => {
      stopSpin();
      setFlash(null);
      setDrawn(target.id);
    }, SPIN_DURATION_MS);
  };

  /**
   * Writes the assignment but leaves the draw state alone, so a sheet can hold
   * its result on screen until the user dismisses it.
   */
  const assignOnly = async (teamId: string): Promise<boolean> => {
    if (!drawn) return false;
    const claimed = drawn;
    const saved = await run(() => onAssign(claimed, teamId));
    if (saved && deferred.has(claimed)) {
      const next = new Set(deferred);
      next.delete(claimed);
      persistDeferred(next);
    }
    return saved;
  };

  const place = async (teamId: string) => {
    if (!drawn) return;
    const claimed = drawn;
    if (await run(() => onAssign(claimed, teamId))) {
      if (deferred.has(claimed)) {
        const next = new Set(deferred);
        next.delete(claimed);
        persistDeferred(next);
      }
      setDrawn(null);
      setClaiming(false);
      setRolling(false);
    }
  };

  if (!season) {
    return (
      <div className="screen">
        <div className="eyebrow">상주리그</div>
        <div className="title">팀짜기</div>
        <div className="blank">
          <div className="blank__title">회차가 없어요</div>
          <div className="blank__sub">경기설정에서 회차를 먼저 만들어 주세요.</div>
        </div>
      </div>
    );
  }

  const drawnPlayer = drawn ? byId.get(drawn) : null;

  return (
    <div className="screen">
      <div className="eyebrow">상주리그 · {season.edition}회</div>
      <div className="rosterHead">
        <div className="rosterHead__left">
          <div className="rosterHead__titleRow">
            <div className="rosterHead__title">팀짜기</div>
          </div>
        </div>
        <div className="count">
          <div className="count__n">{players.length - unassigned.length}</div>
          <div className="count__d">/ {players.length}명 배정</div>
        </div>
      </div>

      {error && <div className="field__error">{error}</div>}

      {seasonTeams.length === 0 ? (
        <>
          <div className="lanePlan">
            <div className="lanePlan__head">
              <span className="lanePlan__label">팀 개수</span>
              <div className="lanePlan__stepper">
                <button
                  type="button"
                  className="lanePlan__btn"
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                  disabled={count <= 1}
                  aria-label="팀 줄이기"
                >
                  −
                </button>
                <span className="lanePlan__value">{count}</span>
                <button
                  type="button"
                  className="lanePlan__btn"
                  onClick={() => setCount((c) => Math.min(20, c + 1))}
                  disabled={count >= 20}
                  aria-label="팀 늘리기"
                >
                  +
                </button>
              </div>
            </div>
            <div className="lanePlan__note">
              팀 인원 제한은 없습니다. 만든 뒤 팀장과 팀원을 지정하세요.
            </div>
          </div>

          <div className="blank">
            <div className="blank__title">아직 팀이 없어요</div>
            <div className="blank__sub">
              {isAdmin
                ? '팀을 만들면 팀장과 팀원을 지정할 수 있어요.'
                : '운영자가 팀을 만들면 여기에 표시됩니다.'}
            </div>
            {isAdmin && (
              <button type="button" className="blank__cta" onClick={() => void makeTeams()} disabled={busy}>
                {busy ? '만드는 중…' : `${count}개 팀 만들기`}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {isAdmin && (
            <div className="drawPanel">
              {flash !== null ? (
                <>
                  <div className="drawPanel__label">뽑는 중…</div>
                  <div className="drawPanel__name drawPanel__name--spin">{flash}</div>
                  <div className="drawPanel__meta">잠시만요</div>
                </>
              ) : drawnPlayer ? (
                <>
                  <div className="drawPanel__label">이 선수를 어느 팀에?</div>
                  <div className="drawPanel__name">{drawnPlayer.name}</div>
                  <div className="drawPanel__meta">
                    {drawnPlayer.gender ?? '—'}
                    {drawnPlayer.avg !== null && ` · 점수 ${drawnPlayer.avg}`}
                    {drawnPlayer.handicap > 0 && ` · 핸디 +${drawnPlayer.handicap}`}
                    {drawnPlayer.penalty > 0 && ` · 패널티 −${drawnPlayer.penalty}`}
                  </div>
                  <div className="drawPanel__actions">
                    <button
                      type="button"
                      className="drawPanel__cta"
                      onClick={() => setClaiming(true)}
                      disabled={busy || seasonTeams.length === 0}
                    >
                      낙찰
                    </button>
                    <button
                      type="button"
                      className="drawPanel__ghost"
                      onClick={() => setRolling(true)}
                      disabled={busy || seasonTeams.length === 0}
                      title="선택한 팀 중에서 무작위로 정합니다"
                    >
                      랜덤배정
                    </button>
                    <button
                      type="button"
                      className="drawPanel__ghost"
                      onClick={defer}
                      disabled={busy}
                      title="이 선수는 반려 복귀 전까지 다시 뽑히지 않습니다"
                    >
                      반려
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="drawPanel__label">
                    {drawPool.length === 0
                      ? unassigned.length === 0
                        ? '모두 배정 완료'
                        : `남은 ${unassigned.length}명 모두 반려됨`
                      : `뽑을 선수 ${drawPool.length}명`}
                  </div>
                  <button
                    type="button"
                    className="drawPanel__cta"
                    onClick={draw}
                    disabled={drawPool.length === 0}
                  >
                    {drawPool.length === 0 ? '뽑을 선수 없음' : '랜덤 뽑기'}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="sectionLabel">
            팀 구성
            <span className="sectionLabel__note">
              팀을 눌러 팀장·팀원 지정
            </span>
          </div>

          <div className="teamStrip">
            {seasonTeams.map((team) => {
              const members = membersOf(team.id);
              const captainId = captainOf(team.id);
              /*
               * 대진·경기 화면과 같은 셈법(teamScore): 합계는 원점수 합이고
               * 핸디·패널티는 그 아래 TeamAdjust 한 줄로 따로 보여준다. 한 명씩
               * 배정될 때마다 올라가므로 뽑는 도중에 팀끼리 비교할 수 있다.
               */
              const score = teamScore(members);
              return (
                <button
                  type="button"
                  key={team.id}
                  className={`teamChip${isAdmin ? ' teamChip--btn' : ''}${
                    members.length === 0 ? ' teamChip--empty' : ''
                  }`}
                  disabled={!isAdmin || busy}
                  onClick={() => setEditing(team)}
                >
                  <div className="teamChip__head">
                    <span className="teamChip__name">{team.name}</span>
                    <span className="teamChip__sum">
                      {score.scored > 0 && (
                        <em className="teamChip__score" title="팀 원점수 합계">
                          {score.base}
                        </em>
                      )}
                      {members.length}명
                    </span>
                  </div>
                  {/* 대진이 아직 없으니 대진 핸디캡은 0 — 팀 자체의 핸디·패널티만. */}
                  <TeamAdjust roster={members} fixtureHandicap={0} />
                  <div className="teamChip__players">
                    {members.length === 0 ? (
                      <span className="teamChip__none">미배정</span>
                    ) : (
                      members.map((p) => (
                        <span className="draftMember" key={p.id}>
                          {captainId === p.id && <em className="captainMark">장</em>}
                          {p.name}
                          {p.avg !== null && ` ${p.avg}`}
                          {p.handicap > 0 && <em className="fixture__adj">+{p.handicap}</em>}
                          {p.penalty > 0 && (
                            <em className="fixture__adj fixture__adj--pen">−{p.penalty}</em>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {deferredPlayers.length > 0 && (
            <div className="deferBox">
              <div className="deferBox__head">
                <span>반려</span>
                <span>{deferredPlayers.length}명 · 복귀 전까지 뽑히지 않음</span>
              </div>
              <div className="deferBox__names">
                {deferredPlayers.map((p) => p.name).join(' · ')}
              </div>
            </div>
          )}

          {drawPool.length > 0 && (
            <>
              <div className="sectionLabel">
                미배정
                <span className="sectionLabel__note">{drawPool.length}명</span>
              </div>
              <div className="teamChip">
                <div className="teamChip__players">
                  {drawPool.map((p) => p.name).join(' · ')}
                </div>
              </div>
            </>
          )}

          {isAdmin && (
            <div className="rosterTools">
              <button
                type="button"
                className="addMemberBtn"
                onClick={() => void run(onAddTeam)}
                disabled={busy}
              >
                <span className="addMemberBtn__plus">+</span> 팀 추가
              </button>
              <button
                type="button"
                className="rosterTools__toggle"
                onClick={restoreDeferred}
                disabled={busy || deferredPlayers.length === 0}
              >
                반려 복귀
                {deferredPlayers.length > 0 && ` ${deferredPlayers.length}`}
              </button>
              <button
                type="button"
                className="rosterTools__toggle"
                onClick={() => void makeTeams()}
                disabled={busy}
              >
                다시 만들기
              </button>
            </div>
          )}
        </>
      )}

      {rolling && drawnPlayer && (
        <RandomAssignSheet
          player={drawnPlayer}
          teams={seasonTeams.map((team) => ({
            team,
            members: membersOf(team.id),
            captainId: captainOf(team.id),
          }))}
          busy={busy}
          onAssign={assignOnly}
          onClose={() => {
            setRolling(false);
            setDrawn(null);
          }}
        />
      )}

      {claiming && drawnPlayer && (
        <ClaimSheet
          player={drawnPlayer}
          teams={seasonTeams.map((team) => ({
            team,
            members: membersOf(team.id),
            captainId: captainOf(team.id),
          }))}
          busy={busy}
          onClaim={(teamId) => void place(teamId)}
          onClose={() => setClaiming(false)}
        />
      )}

      {editing && (
        <TeamMemberSheet
          /*
           * The live row, not the one captured on click — otherwise a rename
           * leaves the sheet showing the old name until it is reopened.
           */
          team={seasonTeams.find((t) => t.id === editing.id) ?? editing}
          members={membersOf(editing.id)}
          captainId={captainOf(editing.id)}
          available={unassigned}
          onAdd={(playerId) => void run(() => onAssign(playerId, editing.id))}
          onRemove={(playerId) => void run(() => onAssign(playerId, null))}
          onSetCaptain={(playerId) => void run(() => onSetCaptain(editing.id, playerId))}
          onClearCaptain={(playerId) => void run(() => onClearCaptain(playerId))}
          onRename={(name) => run(() => onRenameTeam(editing.id, name))}
          onDeleteTeam={() => {
            if (
              !window.confirm(
                `${editing.name}을 삭제할까요?\n소속 선수는 대기 목록으로 돌아가고, 이 팀의 대진도 지워집니다.`,
              )
            ) {
              return;
            }
            void run(() => onDeleteTeam(editing.id)).then((okDone) => {
              if (okDone) setEditing(null);
            });
          }}
          busy={busy}
          error={error}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
