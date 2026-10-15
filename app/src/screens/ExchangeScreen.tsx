import { useState } from 'react';
import type { ExchangeTab } from '../types';
import {
  addExchangeGame,
  clearExchangeSide,
  deleteExchangeGame,
  saveExchangeGame,
  saveExchangeScores,
  deleteExchangePlayer,
  insertExchangePlayers,
  saveExchangeSettings,
  teamName,
  updateExchangePlayer,
  type ExchangeGame,
  type ExchangePlayer,
  type ExchangeSettings,
  type ExchangeSide,
} from '../exchange/api';
import { useExchange } from '../exchange/useExchange';
import { useDismissible } from '../hooks/useBackStack';
import { AddMembersSheet, type MemberDraft } from '../components/AddMembersSheet';
import { MemberSheet, type MemberEdit } from '../components/MemberSheet';
import { ExchangeSettingsSheet } from '../components/exchange/ExchangeSettingsSheet';
import { PlayersTab } from './exchange/PlayersTab';
import { SetupTab } from './exchange/SetupTab';
import { PlayTab } from './exchange/PlayTab';
import { MainTab } from './exchange/MainTab';
import { ExchangeScoreSheet } from '../components/exchange/ExchangeScoreSheet';
import type { GameTable } from '../exchange/tables';
import type { ExchangeMethod } from '../exchange/draw';

interface Props {
  tab: ExchangeTab;
  onGoTab: (tab: ExchangeTab) => void;
  isAdmin: boolean;
  onNotify: (message: string) => void;
}

export function ExchangeScreen({ tab, onGoTab, isAdmin, onNotify }: Props) {
  const exchange = useExchange();
  const { snapshot } = exchange;

  /** Which team's roster is on screen. Not persisted — always opens on 우리 팀. */
  const [side, setSide] = useState<ExchangeSide>('home');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ExchangePlayer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useDismissible(adding, () => setAdding(false));
  useDismissible(editing !== null, () => setEditing(null));
  useDismissible(settingsOpen, () => setSettingsOpen(false));
  /** 점수를 넣고 있는 게임과 테이블. */
  const [scoring, setScoring] = useState<{ game: ExchangeGame; table: GameTable } | null>(null);
  useDismissible(scoring !== null, () => setScoring(null));

  /** Runs one write, then refetches so every tab reads the stored state. */
  const run = async (write: () => Promise<void>, done: string): Promise<boolean> => {
    setBusy(true);
    try {
      await write();
      await exchange.refresh();
      onNotify(done);
      return true;
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '저장에 실패했어요');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const names = (s: ExchangeSide) =>
    new Set(snapshot.players.filter((p) => p.side === s).map((p) => p.name));

  const addPlayers = async (drafts: MemberDraft[]) => {
    const taken = names(side);
    const dupe = drafts.find((d) => taken.has(d.name));
    if (dupe) return onNotify(`이미 등록된 이름입니다: ${dupe.name}`);
    const ok = await run(
      () => insertExchangePlayers(side, drafts),
      `${teamName(side, snapshot.settings)}에 ${drafts.length}명을 등록했어요`,
    );
    if (ok) setAdding(false);
  };

  const savePlayer = async (edit: MemberEdit) => {
    if (!editing) return;
    const taken = names(editing.side);
    taken.delete(editing.name);
    if (taken.has(edit.name)) return onNotify(`이미 등록된 이름입니다: ${edit.name}`);
    const ok = await run(() => updateExchangePlayer(editing.id, edit), '선수 정보를 저장했어요');
    if (ok) setEditing(null);
  };

  const removePlayer = async (player: { id: string; name: string }) => {
    if (!window.confirm(`${player.name} 선수를 명단에서 삭제할까요?`)) return;
    const ok = await run(() => deleteExchangePlayer(player.id), `${player.name} 선수를 삭제했어요`);
    if (ok) setEditing(null);
  };

  const clearSide = () => {
    const name = teamName(side, snapshot.settings);
    const count = snapshot.players.filter((p) => p.side === side).length;
    if (!window.confirm(`${name} 선수 ${count}명을 모두 삭제할까요?`)) return;
    void run(() => clearExchangeSide(side), `${name} 명단을 비웠어요`);
  };

  const saveSettings = async (next: ExchangeSettings) => {
    const ok = await run(() => saveExchangeSettings(next), '설정을 저장했어요');
    if (ok) setSettingsOpen(false);
  };

  const saveLanePlan = (firstLane: number, laneCount: number) =>
    run(
      () => saveExchangeSettings({ ...snapshot.settings, firstLane, laneCount }),
      '레인 설정을 저장했어요',
    );

  const addGame = (method: ExchangeMethod) => {
    const no = (snapshot.games[snapshot.games.length - 1]?.no ?? 0) + 1;
    void run(() => addExchangeGame(no, method), `GAME ${no}을 추가했어요`);
  };

  const removeGame = (no: number) => {
    if (!window.confirm(`GAME ${no}을 삭제할까요?\n레인 배치도 함께 지워집니다.`)) return;
    void run(() => deleteExchangeGame(no), `GAME ${no}을 삭제했어요`);
  };

  const saveGame = (game: ExchangeGame, done: string) => {
    void run(() => saveExchangeGame(game), done);
  };

  const saveScores = async (entries: { playerId: string; score: number | null }[]) => {
    if (!scoring) return;
    const { game, table } = scoring;
    const ok = await run(
      () => saveExchangeScores(game.no, entries),
      `GAME ${game.no} ${table.name} 점수를 저장했어요`,
    );
    if (ok) setScoring(null);
  };

  return (
    <>
      {tab === 'main' ? (
        <MainTab
          snapshot={snapshot}
          state={exchange.state}
          error={exchange.error}
          onRetry={() => void exchange.refresh()}
          onOpenPlay={() => onGoTab('play')}
        />
      ) : tab === 'setup' && isAdmin ? (
        <SetupTab
          snapshot={snapshot}
          state={exchange.state}
          busy={busy}
          onSaveLanePlan={saveLanePlan}
          onAddGame={addGame}
          onDeleteGame={removeGame}
          onSaveGame={saveGame}
          onNotify={onNotify}
        />
      ) : tab === 'play' ? (
        <PlayTab
          snapshot={snapshot}
          state={exchange.state}
          error={exchange.error}
          isAdmin={isAdmin}
          onEnterScores={(game, table) => setScoring({ game, table })}
          onRetry={() => void exchange.refresh()}
        />
      ) : tab === 'players' ? (
        <PlayersTab
          snapshot={snapshot}
          state={exchange.state}
          error={exchange.error}
          isAdmin={isAdmin}
          side={side}
          onChangeSide={setSide}
          onAdd={() => setAdding(true)}
          onEdit={setEditing}
          onOpenSettings={() => setSettingsOpen(true)}
          onClearSide={clearSide}
          onRetry={() => void exchange.refresh()}
        />
      ) : (
        <div className="screen">
          <div className="eyebrow">교류전</div>
          <div className="blank">
            {/* 경기설정 링크를 로그인 확인 전이나 로그아웃 상태로 연 경우. */}
            <div className="blank__title">운영자 전용 화면이에요</div>
            <div className="blank__sub">로그인하면 경기설정을 볼 수 있어요.</div>
          </div>
        </div>
      )}

      {adding && (
        <AddMembersSheet
          title={`${teamName(side, snapshot.settings)} 선수 등록`}
          hint="이름 · 성별 · 에버리지를 적어 주세요. 여성 핸디는 설정에서 일괄 적용됩니다."
          onSave={(drafts) => void addPlayers(drafts)}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <MemberSheet
          member={editing}
          tier={null}
          title="선수 수정"
          hint={`${teamName(editing.side, snapshot.settings)} 소속`}
          onSave={(edit) => void savePlayer(edit)}
          onDelete={(m) => void removePlayer(m)}
          onClose={() => setEditing(null)}
        />
      )}

      {scoring && (
        <ExchangeScoreSheet
          game={scoring.game}
          table={scoring.table}
          settings={snapshot.settings}
          busy={busy}
          onSave={(entries) => void saveScores(entries)}
          onClose={() => setScoring(null)}
        />
      )}

      {settingsOpen && (
        <ExchangeSettingsSheet
          settings={snapshot.settings}
          busy={busy}
          onSave={(next) => void saveSettings(next)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
