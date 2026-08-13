import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomBar } from './components/BottomBar';
import { InstallBanner } from './components/InstallBanner';
import { MemberSheet, type EditorTarget, type MemberDraft } from './components/MemberSheet';
import { RollOverlay } from './components/RollOverlay';
import { ShareSheet } from './components/ShareSheet';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useRoll } from './hooks/useRoll';
import { buildLanes, buildQueue, laneAverage, laneCountFor } from './lib/assign';
import { shareText } from './lib/format';
import { clearState, initialState, loadState, saveState, type PersistedState } from './lib/storage';
import { HistoryScreen } from './screens/HistoryScreen';
import { DrawScreen } from './screens/DrawScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RosterScreen } from './screens/RosterScreen';
import type { Lane, Member, Options, ResultView, Screen, Tier } from './types';

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
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  /** Pre-delete snapshot, restored by the toast's 실행 취소. */
  const undoBuffer = useRef<PersistedState | null>(null);
  const installPrompt = useInstallPrompt();

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
    () =>
      state.laneIds.map((ids, i) => {
        const members = ids
          .map((id) => byId.get(id))
          .filter((m): m is Member => m !== undefined);
        return { no: i + 1, members, avg: laneAverage(members) };
      }),
    [state.laneIds, byId],
  );

  const plannedLaneCount = laneCountFor(attending);
  const placedSet = useMemo(() => new Set(state.placed), [state.placed]);
  const waiting = useMemo(
    () =>
      state.queue
        .filter((id) => !placedSet.has(id))
        .map((id) => byId.get(id))
        .filter((m): m is Member => m !== undefined),
    [state.queue, placedSet, byId],
  );
  const revealedAll = state.queue.length > 0 && state.placed.length >= state.queue.length;

  const roll = useRoll(lanes.length);
  const activeMember = roll.activeId ? byId.get(roll.activeId) ?? null : null;

  /** History excluding the game on screen — what 중복 방지 actually scored against. */
  const priorHistory = useMemo(
    () => state.history.filter((h) => h.game !== state.game),
    [state.history, state.game],
  );

  // ── Roster actions ─────────────────────────────────────────
  const toggleAttend = (id: string) =>
    setState((s) => ({ ...s, attend: { ...s.attend, [id]: !s.attend[id] } }));

  const toggleOption = (key: keyof Options) =>
    setState((s) => ({ ...s, opts: { ...s.opts, [key]: !s.opts[key] } }));

  const saveMember = (draft: MemberDraft) => {
    setState((s) => {
      if (editor?.mode === 'edit') {
        const id = editor.member.id;
        return { ...s, roster: s.roster.map((m) => (m.id === id ? { ...m, ...draft } : m)) };
      }
      // Monotonic suffix so an id is never reused after deletions.
      const nextNum =
        s.roster.reduce((max, m) => {
          const n = Number(m.id.replace(/^m/, ''));
          return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0) + 1;
      const id = `m${nextNum}`;
      return {
        ...s,
        roster: [...s.roster, { id, ...draft }],
        attend: { ...s.attend, [id]: true },
      };
    });
    setEditor(null);
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
    setEditor(null);
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
      const built = buildLanes(att, s.opts, s.history);
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

  const resetDraw = () => {
    roll.reset();
    setState((s) => ({ ...s, placed: [], screen: 'draw' }));
  };

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

  const resetEverything = () => {
    if (!window.confirm('명단·기록·설정을 모두 초기 상태로 되돌립니다. 계속할까요?')) return;
    roll.reset();
    clearState();
    setState(initialState());
    setEditMode(false);
    flash('초기 상태로 되돌렸어요');
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

  const boardMode = state.screen === 'result' && state.resultView === 'board';

  // Keep the standalone status-bar tint in step with the surface behind it.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', boardMode ? '#0F1115' : '#F4F3F0');
  }, [boardMode]);

  const showInstallBanner =
    state.screen === 'roster' && (installPrompt.canInstall || installPrompt.showIosHint);

  return (
    <div className="app" data-dark={boardMode}>
      <div className="app__scroll">
        {showInstallBanner && (
          <InstallBanner
            canInstall={installPrompt.canInstall}
            onInstall={() => void installPrompt.install()}
            onDismiss={installPrompt.dismiss}
          />
        )}

        {state.screen === 'roster' && (
          <RosterScreen
            roster={state.roster}
            attend={state.attend}
            opts={state.opts}
            attendCount={attending.length}
            laneCount={plannedLaneCount}
            editMode={editMode}
            onToggleEditMode={() => setEditMode((v) => !v)}
            onToggleAttend={toggleAttend}
            onToggleOption={toggleOption}
            onEditMember={(member) => setEditor({ mode: 'edit', member })}
            onDeleteMember={deleteMember}
            onAddMember={(tier: Tier) => setEditor({ mode: 'add', tier })}
            onLoadSample={() => void loadSample()}
            onResetData={resetEverything}
          />
        )}

        {state.screen === 'draw' && (
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

        {state.screen === 'result' && (
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

        {state.screen === 'history' && <HistoryScreen history={state.history} byId={byId} />}
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

      {editor && (
        <MemberSheet
          target={editor}
          onSave={saveMember}
          onDelete={deleteMember}
          onClose={() => setEditor(null)}
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
        onReset={resetDraw}
        onTab={goTab}
      />
    </div>
  );
}
