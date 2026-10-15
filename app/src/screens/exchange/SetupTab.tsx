import { useEffect, useMemo, useState } from 'react';
import type { LoadState } from '../../league/useLeague';
import {
  teamName,
  type ExchangeGame,
  type ExchangeSnapshot,
} from '../../exchange/api';
import { gameTables } from '../../exchange/tables';
import {
  autoLaneCount,
  drawGame,
  drawProblem,
  EXCHANGE_METHODS,
  LANES_PER_TABLE,
  methodLabel,
  tierMapFor,
  type ExchangeMethod,
} from '../../exchange/draw';

const MAX_LANE_NO = 99;

interface Props {
  snapshot: ExchangeSnapshot;
  state: LoadState;
  busy: boolean;
  onSaveLanePlan: (firstLane: number, laneCount: number) => Promise<boolean>;
  onAddGame: (method: ExchangeMethod) => void;
  onDeleteGame: (no: number) => void;
  onSaveGame: (game: ExchangeGame, done: string) => void;
  onNotify: (message: string) => void;
}

/** 레인 설정 + 게임별 팀 짜기. 운영자 전용 탭. */
export function SetupTab({
  snapshot,
  state,
  busy,
  onSaveLanePlan,
  onAddGame,
  onDeleteGame,
  onSaveGame,
  onNotify,
}: Props) {
  const { settings, players, games } = snapshot;

  // 레인 설정은 고칠 때마다 쓰지 않고, 저장(또는 팀 짜기) 때 한 번에 쓴다.
  const [firstLane, setFirstLane] = useState(settings.firstLane);
  const [laneChoice, setLaneChoice] = useState(settings.laneCount);
  useEffect(() => {
    setFirstLane(settings.firstLane);
    setLaneChoice(settings.laneCount);
  }, [settings.firstLane, settings.laneCount]);

  const autoLanes = autoLaneCount(players.length);
  const laneCount = laneChoice > 0 ? laneChoice : autoLanes;
  const maxLanes = Math.min(98, Math.max(LANES_PER_TABLE, Math.floor(players.length / 2) * 2));
  const tables = laneCount / LANES_PER_TABLE;
  const planDirty = firstLane !== settings.firstLane || laneChoice !== settings.laneCount;

  /** 다른 사람과 자리를 바꾸려고 고른 선수. */
  const [picked, setPicked] = useState<{ game: number; id: string } | null>(null);
  /** 게임별로 고른 방식 — 팀 짜기를 눌러야 저장된다. */
  const [pending, setPending] = useState<Record<number, ExchangeMethod>>({});

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p] as const)), [players]);

  const draw = async (game: ExchangeGame) => {
    const method = pending[game.no] ?? game.method;
    const problem = drawProblem(method, players, laneCount);
    if (problem) return onNotify(problem);
    const scored = Object.keys(game.scores).length;
    if (
      game.lanes.length > 0 &&
      !window.confirm(
        `GAME ${game.no} 을(를) ${methodLabel(method)}으로 다시 짤까요?\n바꾼 자리도 모두 다시 정해집니다.` +
          (scored > 0 ? `\n입력된 점수 ${scored}명분은 선수에게 그대로 남습니다.` : ''),
      )
    ) {
      return;
    }
    if (planDirty && !(await onSaveLanePlan(firstLane, laneChoice))) return;
    setPicked(null);
    onSaveGame(
      { ...game, method, lanes: drawGame(method, players, settings, laneCount) },
      `GAME ${game.no} ${methodLabel(method)} 배치를 저장했어요`,
    );
  };

  const tap = (game: ExchangeGame, id: string) => {
    if (busy) return;
    if (!picked || picked.game !== game.no) return setPicked({ game: game.no, id });
    if (picked.id === id) return setPicked(null);
    const a = picked.id;
    const lanes = game.lanes.map((lane) => lane.map((x) => (x === a ? id : x === id ? a : x)));
    setPicked(null);
    const na = byId.get(a)?.name ?? '';
    const nb = byId.get(id)?.name ?? '';
    onSaveGame({ ...game, lanes }, `${na} ↔ ${nb} 자리를 바꿨어요`);
  };

  const lastNo = games.length > 0 ? games[games.length - 1]!.no : 0;

  return (
    <div className="screen">
      <div className="eyebrow">교류전</div>
      <div className="rosterHead">
        <div className="rosterHead__left">
          <div className="rosterHead__titleRow">
            <div className="rosterHead__title">경기 설정</div>
          </div>
        </div>
        <div className="count">
          <div className="count__n">{games.length}</div>
          <div className="count__d">게임</div>
        </div>
      </div>

      {state === 'loading' && players.length === 0 && (
        <div className="notice notice--calm">불러오는 중…</div>
      )}

      <div className="lanePlan">
        <div className="lanePlan__head">
          <span className="lanePlan__label">레인 설정</span>
          <div className="lanePlan__fields">
            <Stepper
              label="수"
              value={laneCount}
              onDown={() => setLaneChoice(Math.max(LANES_PER_TABLE, laneCount - LANES_PER_TABLE))}
              onUp={() => setLaneChoice(Math.min(maxLanes, laneCount + LANES_PER_TABLE))}
              downOff={laneCount <= LANES_PER_TABLE}
              upOff={laneCount >= maxLanes}
              what="레인"
            />
            <Stepper
              label="시작"
              value={firstLane}
              onDown={() => setFirstLane(Math.max(1, firstLane - 1))}
              onUp={() => setFirstLane(Math.min(MAX_LANE_NO - laneCount + 1, firstLane + 1))}
              downOff={firstLane <= 1}
              upOff={firstLane >= MAX_LANE_NO - laneCount + 1}
              what="시작 레인"
            />
          </div>
        </div>
        <div className="lanePlan__note">
          {firstLane}~{firstLane + laneCount - 1}번 레인 · {tables}테이블
          {players.length > 0 && ` · 테이블당 ${seatRange(players.length, tables)}명`}
          {laneChoice > 0 && laneChoice !== autoLanes && (
            <button type="button" className="lanePlan__reset" onClick={() => setLaneChoice(0)}>
              자동 {autoLanes}레인
            </button>
          )}
          {planDirty && (
            <button
              type="button"
              className="lanePlan__reset exPlan__save"
              disabled={busy}
              onClick={() => void onSaveLanePlan(firstLane, laneChoice)}
            >
              저장
            </button>
          )}
        </div>
      </div>

      <div className="exLegend">
        <span className="exDot exDot--home" /> {teamName('home', settings)}
        <span className="exDot exDot--away" /> {teamName('away', settings)}
        <span className="exLegend__hint">선수 둘을 차례로 누르면 자리가 바뀝니다</span>
      </div>

      {games.map((game) => {
        const method = pending[game.no] ?? game.method;
        const changed = method !== game.method;
        const tiers = tierMapFor(game.method, players);
        const placed = new Set(game.lanes.flat());
        const missing = players.filter((p) => !placed.has(p.id)).length;
        const drawn = game.lanes.length > 0;
        return (
          <div className="exGame" key={game.no}>
            <div className="exGame__head">
              <div className="exGame__no">GAME {game.no}</div>
              {drawn && <div className="exGame__method">{methodLabel(game.method)}</div>}
              {game.no === lastNo && (
                <button
                  type="button"
                  className="exGame__del"
                  disabled={busy}
                  onClick={() => {
                    // 같은 번호로 다시 추가될 때 지난 선택이 남지 않게.
                    setPending(({ [game.no]: _, ...rest }) => rest);
                    onDeleteGame(game.no);
                  }}
                >
                  삭제
                </button>
              )}
            </div>

            <div className="chips exGame__chips">
              {EXCHANGE_METHODS.map((m) => (
                <button
                  type="button"
                  key={m.key}
                  className={`chip${method === m.key ? ' chip--on' : ''}`}
                  aria-pressed={method === m.key}
                  onClick={() => setPending((p) => ({ ...p, [game.no]: m.key }))}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="exGame__desc">
              {EXCHANGE_METHODS.find((m) => m.key === method)?.desc}
            </div>

            <button
              type="button"
              className="exGame__draw"
              disabled={busy}
              onClick={() => void draw(game)}
            >
              {!drawn ? '팀 짜기' : changed ? `${methodLabel(method)}으로 다시 짜기` : '다시 짜기'}
            </button>

            {drawn && missing > 0 && (
              <div className="notice">배치 뒤에 등록된 선수 {missing}명이 빠져 있어요 — 다시 짜 주세요.</div>
            )}
            {drawn && game.lanes.length !== laneCount && (
              <div className="hintBox hintBox--tight">
                이 게임은 {game.lanes.length}레인으로 짜여 있어요. 지금 설정({laneCount}레인)으로
                바꾸려면 다시 짜 주세요.
              </div>
            )}

            {drawn && (
              <div className="exTables">
                {gameTables(game, byId, settings).map((table) => {
                  const first = table.firstLane;
                  return (
                    <div className="exTable" key={table.idx}>
                      <div className="exTable__head">
                        <span className="exTable__no">{table.name}</span>
                        <span className="exTable__lanes">
                          {first}
                          {table.lanes.length > 1 && `-${first + 1}`}레인
                        </span>
                        {table.label && <span className="exTable__label">{table.label}</span>}
                        <span className="exTable__avg">평균 {table.avg}</span>
                      </div>
                      <div className="exTable__lanesRow">
                        {table.lanes.map((lane, k) => (
                          <div className="exLane" key={k}>
                            <div className="exLane__no">{first + k}</div>
                            {lane.map((p) => {
                              const id = p.id;
                              const on = picked?.game === game.no && picked.id === id;
                              return (
                                <button
                                  type="button"
                                  key={id}
                                  className={`exPlayer${on ? ' exPlayer--on' : ''}`}
                                  onClick={() => tap(game, id)}
                                  aria-pressed={on}
                                >
                                  <span className={`exDot exDot--${p.side}`} />
                                  <span className="exPlayer__name">{p.name}</span>
                                  <span className="exPlayer__tier">{tiers.get(id)}</span>
                                  <span className="exPlayer__avg">{p.avg}</span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="addMemberBtn exAddGame"
        disabled={busy}
        onClick={() => onAddGame(games[games.length - 1]?.method ?? 'clubs')}
      >
        <span className="addMemberBtn__plus">+</span> 게임 추가
      </button>
    </div>
  );
}

function Stepper(props: {
  label: string;
  value: number;
  what: string;
  onDown: () => void;
  onUp: () => void;
  downOff: boolean;
  upOff: boolean;
}) {
  return (
    <div className="lanePlan__field">
      <span className="lanePlan__fieldK">{props.label}</span>
      <div className="lanePlan__stepper">
        <button
          type="button"
          className="lanePlan__btn"
          onClick={props.onDown}
          disabled={props.downOff}
          aria-label={`${props.what} 줄이기`}
        >
          −
        </button>
        <span className="lanePlan__value">{props.value}</span>
        <button
          type="button"
          className="lanePlan__btn"
          onClick={props.onUp}
          disabled={props.upOff}
          aria-label={`${props.what} 늘리기`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** "6" when every table seats the same, "5~6" otherwise. */
function seatRange(count: number, tables: number): string {
  const lo = Math.floor(count / tables);
  const hi = Math.ceil(count / tables);
  return lo === hi ? String(lo) : `${lo}~${hi}`;
}
