import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomBar } from './components/BottomBar';
import { InstallPill } from './components/InstallBanner';
import { AddMembersSheet, type MemberDraft } from './components/AddMembersSheet';
import { MemberSheet, type MemberEdit } from './components/MemberSheet';
import { RollOverlay } from './components/RollOverlay';
import { ShareSheet } from './components/ShareSheet';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useAdminAuth } from './league/useAdminAuth';
import { LoginSheet } from './components/LoginSheet';
import { useRoll } from './hooks/useRoll';
import {
  buildLanes,
  buildQueue,
  hydrateLanes,
  laneCountFor,
  laneSizes,
  minLaneCount,
  tierMap,
} from './lib/assign';
import { shareText } from './lib/format';
import { clearState, initialState, loadState, saveState, type PersistedState } from './lib/storage';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { TabBar } from './components/TabBar';
import { DrawScreen } from './screens/DrawScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RosterScreen } from './screens/RosterScreen';
import type {
  Lane,
  LeagueTab,
  Member,
  Options,
  Ranked,
  ResultView,
  Screen,
  Section,
  Tier,
} from './types';
import { LEAGUE_TABS } from './types';

const APP_TITLE = '9FRAME';

const SECTION_TITLES: Record<Exclude<Section, 'home'>, string> = {
  teams: '팀짜기',
  league: '상주리그',
};

const TOAST_MS = 1800;
/** Longer, because the user has to notice the undo and reach for it. */
const UNDO_MS = 6000;

interface ToastAction {
  label: string;
  run: () => void;
}

export default function App() {
  const [state, setState] = useState<PersistedState>(loadState);
  const [shareOpen, setShareOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  /** Pre-delete snapshot, restored by the toast's 실행 취소. */
  const undoBuffer = useRef<PersistedState | null>(null);
  const installPrompt = useInstallPrompt();
  const auth = useAdminAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  // Not persisted: entering 상주리그 always lands on 메인.
  const [leagueTabState, setLeagueTabState] = useState<LeagueTab>('main');

  useEffect(() => saveState(state), [state]);

  const flash = useCallback((message: string, action?: ToastAction) => {
    setToast({ message, action });
    if (toastTimer.current !== undefined) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), action ? UNDO_MS : TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== undefined) clearTimeout(toastTimer.current);
    },
    [],
  );

  // ── Derived ────────────────────────────────────────────────
  const byId = useMemo(
    () => new Map(state.roster.map((m) => [m.id, m] as const)),
    [state.roster],
  );

  const attending = useMemo(
    () => state.roster.filter((m) => state.attend[m.id]),
    [state.roster, state.attend],
  );

  /** Current draw's lanes, rehydrated from ids so roster edits flow through. */
  const lanes = useMemo<Lane[]>(
    () => hydrateLanes(state.laneIds, byId),
    [state.laneIds, byId],
  );

  /** Tier per attending member — recomputed whenever scores or attendance change. */
  const tiers = useMemo(() => tierMap(attending), [attending]);

  /**
   * Tiers as used by the draw in progress. Taken from the lanes themselves, not
   * from current attendance, so the waiting list and the lane cards agree even
   * if someone is checked in or out mid-draw.
   */
  const drawTiers = useMemo(() => {
    const map = new Map<string, Tier>();
    for (const lane of lanes) for (const m of lane.members) map.set(m.id, m.tier);
    return map;
  }, [lanes]);

  /** Lanes the next draw will use: the operator's choice, or the automatic fit. */
  const autoLaneCount = laneCountFor(attending);
  const chosenLaneCount = state.laneCount;
  const plannedLaneCount =
    chosenLaneCount !== null && laneSizes(attending.length, chosenLaneCount).length > 0
      ? chosenLaneCount
      : autoLaneCount;
  const plannedSizes = laneSizes(attending.length, plannedLaneCount);
  const placedSet = useMemo(() => new Set(state.placed), [state.placed]);
  const waiting = useMemo<Ranked[]>(
    () =>
      state.queue
        .filter((id) => !placedSet.has(id))
        .map((id) => {
          const m = byId.get(id);
          return m ? { ...m, tier: drawTiers.get(id) ?? 3 } : undefined;
        })
        .filter((m): m is Ranked => m !== undefined),
    [state.queue, placedSet, byId, drawTiers],
  );
  const revealedAll = state.queue.length > 0 && state.placed.length >= state.queue.length;

  const roll = useRoll(lanes.length);
  const activeMember = useMemo<Ranked | null>(() => {
    if (!roll.activeId) return null;
    const m = byId.get(roll.activeId);
    return m ? { ...m, tier: drawTiers.get(m.id) ?? 3 } : null;
  }, [roll.activeId, byId, drawTiers]);

  /** History excluding the game on screen — what 중복 방지 actually scored against. */
  const priorHistory = useMemo(
    () => state.history.filter((h) => h.game !== state.game),
    [state.history, state.game],
  );

  // ── Roster actions ─────────────────────────────────────────
  const toggleAttend = (id: string) =>
    setState((s) => ({ ...s, attend: { ...s.attend, [id]: !s.attend[id] } }));

  const setAllAttend = (attending: boolean) =>
    setState((s) => ({
      ...s,
      attend: Object.fromEntries(s.roster.map((m) => [m.id, attending])),
    }));

  const toggleOption = (key: keyof Options) =>
    setState((s) => ({ ...s, opts: { ...s.opts, [key]: !s.opts[key] } }));

  /** Applies an edit to one existing member. Tier is not stored, so it follows the new score. */
  const saveMemberEdit = (edit: MemberEdit) => {
    if (!editing) return;
    const id = editing.id;
    setState((s) => ({
      ...s,
      roster: s.roster.map((m) => (m.id === id ? { ...m, ...edit } : m)),
    }));
    setEditing(null);
  };

  /** Appends a batch of new members, all marked attending. */
  const addMembers = (drafts: MemberDraft[]) => {
    setState((s) => {
      // Monotonic suffix so an id is never reused after deletions.
      let next =
        s.roster.reduce((max, m) => {
          const n = Number(m.id.replace(/^m/, ''));
          return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0) + 1;
      const added = drafts.map((d) => ({ id: `m${next++}`, ...d }));
      return {
        ...s,
        roster: [...s.roster, ...added],
        attend: { ...s.attend, ...Object.fromEntries(added.map((m) => [m.id, true])) },
      };
    });
    setAdding(false);
    flash(`${drafts.length}명을 등록했어요`);
  };

  /**
   * Purge a member from the roster and every structure that references them,
   * keeping the previous state around so the toast can offer an undo.
   */
  const deleteMember = (member: Member) => {
    const inDraw = state.queue.includes(member.id);
    const warning = inDraw
      ? `${member.name} 님을 삭제하면 진행 중인 배정에서도 빠집니다. 삭제할까요?`
      : `${member.name} 님을 명단에서 삭제할까요?`;
    if (!window.confirm(warning)) return;

    const id = member.id;
    undoBuffer.current = state;
    setState((s) => {
      const attend = { ...s.attend };
      delete attend[id];
      return {
        ...s,
        roster: s.roster.filter((m) => m.id !== id),
        attend,
        queue: s.queue.filter((q) => q !== id),
        placed: s.placed.filter((p) => p !== id),
        laneIds: s.laneIds.map((l) => l.filter((x) => x !== id)).filter((l) => l.length > 0),
        history: s.history
          .map((h) => ({
            ...h,
            lanes: h.lanes.map((l) => l.filter((x) => x !== id)).filter((l) => l.length > 0),
          }))
          .filter((h) => h.lanes.length > 0),
      };
    });
    setEditing(null);
    flash(`${member.name} 님을 삭제했어요`, {
      label: '실행 취소',
      run: () => {
        const snapshot = undoBuffer.current;
        if (snapshot) setState(snapshot);
        undoBuffer.current = null;
      },
    });
  };

  // ── Draw actions ───────────────────────────────────────────
  /** Build a fresh assignment. `bumpGame` starts the next game number. */
  const startAssignment = (bumpGame: boolean) => {
    roll.reset();
    setState((s) => {
      const att = s.roster.filter((m) => s.attend[m.id]);
      const lanes =
        s.laneCount !== null && laneSizes(att.length, s.laneCount).length > 0
          ? s.laneCount
          : laneCountFor(att);
      const built = buildLanes(att, s.opts, s.history, lanes);
      return {
        ...s,
        game: bumpGame ? s.game + 1 : s.game,
        laneIds: built.map((l) => l.members.map((m) => m.id)),
        queue: buildQueue(att),
        placed: [],
        screen: 'draw',
      };
    });
  };

  const rollFor = (id: string) => {
    if (roll.phase !== 'idle' || placedSet.has(id)) return;
    const laneNo = lanes.find((l) => l.members.some((m) => m.id === id))?.no;
    if (laneNo === undefined) return;
    roll.start(id, laneNo, () => setState((s) => ({ ...s, placed: [...s.placed, id] })));
  };

  const undoPlacement = (id: string) =>
    setState((s) => ({ ...s, placed: s.placed.filter((p) => p !== id) }));

  const fillRest = () => {
    roll.reset();
    setState((s) => ({ ...s, placed: s.queue.slice() }));
  };

  const finish = () =>
    setState((s) => ({
      ...s,
      screen: 'result',
      history: [
        { game: s.game, lanes: s.laneIds },
        ...s.history.filter((h) => h.game !== s.game),
      ],
    }));

  /**
   * Re-randomise the current game. Clearing `placed` alone would replay the
   * *same* lanes, so this rebuilds the assignment and the draw order too.
   */
  const redraw = () => {
    if (state.placed.length > 0 && !window.confirm('지금까지 뽑은 결과를 지우고 레인을 다시 배정할까요?')) {
      return;
    }
    startAssignment(false);
  };

  // ── Section navigation ─────────────────────────────────────
  const openSection = (section: Exclude<Section, 'home'>) => {
    if (section === 'league') setLeagueTabState('main');
    setState((s) => ({ ...s, section }));
  };

  /** Back out to the hub. Any draw in progress is kept, not discarded. */
  const goHome = () => {
    roll.reset();
    setState((s) => ({ ...s, section: 'home' }));
  };

  const goLeagueTab = (leagueTab: LeagueTab) => setLeagueTabState(leagueTab);

  const goTab = (key: 'roster' | 'draw' | 'history') => {
    const target: Screen = key === 'draw' && lanes.length === 0 ? 'roster' : key;
    setState((s) => ({ ...s, screen: target }));
  };

  /** Loads the prototype's 30-member roster so the app can be tried without typing. */
  const loadSample = async () => {
    const { SAMPLE_ATTEND, SAMPLE_HISTORY, SAMPLE_ROSTER } = await import('./data/roster');
    roll.reset();
    setState((s) => ({
      ...s,
      roster: SAMPLE_ROSTER,
      attend: SAMPLE_ATTEND,
      history: SAMPLE_HISTORY,
      game: 1,
      laneIds: [],
      queue: [],
      placed: [],
      screen: 'roster',
    }));
    flash('예시 명단 30명을 불러왔어요');
  };

  /** Wipes the roster, history and any draw in progress, back to first-run state. */
  const resetEverything = () => {
    const warning =
      `멤버 ${state.roster.length}명과 기록 ${state.history.length}건을 모두 삭제합니다.\n` +
      '계속할까요?';
    if (!window.confirm(warning)) return;
    undoBuffer.current = state;
    roll.reset();
    clearState();
    setState(initialState());
    setEditMode(false);
    flash('명단과 기록을 모두 삭제했어요', {
      label: '실행 취소',
      run: () => {
        const snapshot = undoBuffer.current;
        if (snapshot) setState(snapshot);
        undoBuffer.current = null;
      },
    });
  };

  // ── Share ──────────────────────────────────────────────────
  const copyText = async () => {
    const text = shareText(state.game, lanes);
    try {
      await navigator.clipboard.writeText(text);
      flash('배정 결과를 복사했어요');
    } catch {
      flash('복사에 실패했어요');
    }
  };

  const nativeShare = async () => {
    const text = shareText(state.game, lanes);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `GAME ${state.game} 레인 배정`, text });
        return;
      } catch {
        // Cancelled or unsupported payload — fall through to clipboard.
      }
    }
    await copyText();
  };

  // ── Bottom bar wiring ──────────────────────────────────────
  const ctaLabel = (() => {
    if (state.screen === 'roster') {
      if (state.roster.length === 0) return '멤버를 추가해 주세요';
      if (attending.length === 0) return '참석자를 1명 이상 선택하세요';
      return `${attending.length}명 · ${plannedLaneCount}레인 배정하기`;
    }
    if (state.screen === 'draw') {
      if (revealedAll) return '결과 보기';
      if (roll.phase !== 'idle') return '뽑는 중…';
      return `남은 ${waiting.length}명 자동 배정`;
    }
    return `GAME ${state.game + 1} 재배정`;
  })();

  const onCta = () => {
    if (state.screen === 'roster') return startAssignment(false);
    if (state.screen === 'draw') {
      if (revealedAll) return finish();
      if (roll.phase === 'idle') return fillRest();
      return;
    }
    startAssignment(true);
  };

  const teams = state.section === 'teams';
  const league = state.section === 'league';

  const visibleLeagueTabs = useMemo(
    () => LEAGUE_TABS.filter((t) => !t.adminOnly || auth.isAdmin),
    [auth.isAdmin],
  );

  /**
   * Signing out while 경기설정 is open would leave a tab selected that no longer
   * exists, so fall back to the first visible one.
   */
  const leagueTab = visibleLeagueTabs.some((t) => t.key === leagueTabState)
    ? leagueTabState
    : (visibleLeagueTabs[0]?.key ?? 'main');
  const boardMode = teams && state.screen === 'result' && state.resultView === 'board';

  // Keep the standalone status-bar tint in step with the surface behind it.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', boardMode ? '#0F1115' : '#F4F3F0');
  }, [boardMode]);

  /**
   * The app bar carries one small install button and nothing else — no banner.
   * It shows on every screen for as long as the app runs in a browser tab, and
   * disappears on its own once the app is installed and opened standalone.
   */
  const showInstall = installPrompt.installable;

  return (
    <div className="app" data-dark={boardMode}>
      <div className="app__scroll">
        <div className="appBar">
          {state.section === 'home' ? (
            <div className="appBar__title">{APP_TITLE}</div>
          ) : (
            <button type="button" className="appBar__back" onClick={goHome}>
              <span className="appBar__chevron" aria-hidden="true">
                ‹
              </span>
              {SECTION_TITLES[state.section]}
            </button>
          )}
          <div className="appBar__right">
            {showInstall && (
              <InstallPill
                onClick={() => {
                  // Chromium can go straight to its own dialog. Everywhere else
                  // installing is a browser-menu step we can only point at.
                  if (installPrompt.canPrompt) void installPrompt.install();
                  else flash(installPrompt.hint);
                }}
              />
            )}
            {auth.ready &&
              (auth.isAdmin ? (
                <button
                  type="button"
                  className="authPill authPill--on"
                  title={auth.email ?? undefined}
                  onClick={() => void auth.signOut().then(() => flash('로그아웃했어요'))}
                >
                  운영자
                </button>
              ) : (
                <button
                  type="button"
                  className="authPill"
                  onClick={() => setLoginOpen(true)}
                >
                  로그인
                </button>
              ))}
          </div>
        </div>

        {state.section === 'home' && (
          <HomeScreen
            memberCount={state.roster.length}
            attendCount={attending.length}
            game={state.game}
            onOpen={openSection}
          />
        )}

        {teams && state.screen === 'roster' && (
          <RosterScreen
            roster={state.roster}
            attend={state.attend}
            opts={state.opts}
            attendCount={attending.length}
            laneCount={plannedLaneCount}
            laneSizes={plannedSizes}
            minLaneCount={minLaneCount(attending.length)}
            autoLaneCount={autoLaneCount}
            laneCountChosen={chosenLaneCount !== null}
            onChangeLaneCount={(n) => setState((s) => ({ ...s, laneCount: n }))}
            editMode={editMode}
            onToggleEditMode={() => setEditMode((v) => !v)}
            onToggleAttend={toggleAttend}
            onSetAllAttend={setAllAttend}
            onToggleOption={toggleOption}
            tiers={tiers}
            onEditMember={setEditing}
            onDeleteMember={deleteMember}
            onAddMembers={() => setAdding(true)}
            onLoadSample={() => void loadSample()}
            onResetData={resetEverything}
          />
        )}

        {teams && state.screen === 'draw' && (
          <DrawScreen
            game={state.game}
            lanes={lanes}
            waiting={waiting}
            placed={state.placed}
            phase={roll.phase}
            landedLane={roll.phase === 'landed' ? roll.rollNo : 0}
            placedCount={state.placed.length}
            totalCount={state.queue.length}
            revealedAll={revealedAll}
            onRoll={rollFor}
            onUndo={undoPlacement}
          />
        )}

        {teams && state.screen === 'result' && (
          <ResultScreen
            game={state.game}
            lanes={lanes}
            opts={state.opts}
            priorHistory={priorHistory}
            view={state.resultView}
            onChangeView={(view: ResultView) => setState((s) => ({ ...s, resultView: view }))}
            onShare={() => setShareOpen(true)}
          />
        )}

        {teams && state.screen === 'history' && (
          <HistoryScreen history={state.history} byId={byId} />
        )}

        {league && (
          <LeagueScreen
            tab={leagueTab}
            onGoTab={goLeagueTab}
            isAdmin={auth.isAdmin}
            onNotify={flash}
          />
        )}
      </div>

      {roll.phase !== 'idle' && (
        <RollOverlay
          phase={roll.phase}
          rollNo={roll.rollNo}
          member={activeMember}
          revealedAll={revealedAll}
        />
      )}

      {shareOpen && (
        <ShareSheet
          game={state.game}
          lanes={lanes}
          onClose={() => setShareOpen(false)}
          onShare={nativeShare}
          onCopy={copyText}
        />
      )}

      {adding && <AddMembersSheet onSave={addMembers} onClose={() => setAdding(false)} />}

      {editing && (
        <MemberSheet
          member={editing}
          tier={tiers.get(editing.id) ?? null}
          onSave={saveMemberEdit}
          onDelete={deleteMember}
          onClose={() => setEditing(null)}
        />
      )}

      {loginOpen && (
        <LoginSheet
          onSignIn={auth.signIn}
          onClose={() => setLoginOpen(false)}
        />
      )}

      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {league && (
        <div className="app__bottom">
          <TabBar
            tabs={visibleLeagueTabs}
            isActive={(key) => leagueTab === key}
            onSelect={goLeagueTab}
          />
        </div>
      )}

      {/* The hub has no CTA or tabs — those belong to the feature you are inside. */}
      {teams && (
        <BottomBar
          screen={state.screen}
          ctaVisible={state.screen !== 'history'}
          ctaLabel={ctaLabel}
          ctaDisabled={
            (state.screen === 'roster' && (state.roster.length === 0 || attending.length === 0)) ||
            (state.screen === 'draw' && roll.phase !== 'idle')
          }
          resetVisible={
            (state.screen === 'draw' || state.screen === 'result') && roll.phase === 'idle'
          }
          onCta={onCta}
          onReset={redraw}
          onTab={goTab}
        />
      )}
    </div>
  );
}
