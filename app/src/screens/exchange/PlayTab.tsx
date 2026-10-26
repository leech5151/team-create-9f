import { useMemo, useState } from "react";
import type { LoadState } from "../../league/useLeague";
import {
  EXCHANGE_SIDES,
  handicapOf,
  teamName,
  type ExchangeGame,
  type ExchangeSnapshot,
} from "../../exchange/api";
import { methodLabel, tierMapFor } from "../../exchange/draw";
import {
  clubTallies,
  compareTally,
  gameTables,
  tally,
  type GameTable,
} from "../../exchange/tables";

interface Props {
  snapshot: ExchangeSnapshot;
  state: LoadState;
  error: string | null;
  isAdmin: boolean;
  onEnterScores: (game: ExchangeGame, table: GameTable) => void;
  onRetry: () => void;
}

/** 게임별 레인 배정을 결과 화면처럼 보여주고, 운영자는 팀 단위로 점수를 넣는다. */
export function PlayTab({
  snapshot,
  state,
  error,
  isAdmin,
  onEnterScores,
  onRetry,
}: Props) {
  const { settings, players } = snapshot;
  const games = useMemo(
    () => snapshot.games.filter((g) => g.lanes.length > 0),
    [snapshot.games],
  );
  const byId = useMemo(
    () => new Map(players.map((p) => [p.id, p] as const)),
    [players],
  );

  /**
   * 고른 게임이 없으면 점수가 덜 들어간 첫 게임 — 경기 중에 열면 지금 치는
   * 게임이 바로 나온다. 다 들어갔으면 마지막 게임.
   */
  const [chosen, setChosen] = useState<number | null>(null);
  const game =
    games.find((g) => g.no === chosen) ??
    games.find((g) => Object.keys(g.scores).length < g.lanes.flat().length) ??
    games[games.length - 1] ??
    null;

  if (!game) {
    return (
      <div className="screen">
        <div className="eyebrow">교류전</div>
        {state === "offline" && (
          <div className="notice">
            서버에 연결하지 못했어요.
            {error && <div className="notice__detail">{error}</div>}
            <button type="button" className="notice__action" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        )}
        <div className="blank">
          <div className="blank__title">
            {state === "loading" ? "불러오는 중…" : "아직 짜인 게임이 없어요"}
          </div>
          {state !== "loading" && (
            <div className="blank__sub">
              {isAdmin
                ? "경기설정에서 게임을 추가하고 팀을 짜 주세요."
                : "운영자가 팀을 짜면 여기에 레인 배정이 표시됩니다."}
            </div>
          )}
        </div>
      </div>
    );
  }

  const tables = gameTables(game, byId, settings);
  const tiers = tierMapFor(game.method, players);
  const clubs = clubTallies(game, byId, settings);
  const placed = tables.reduce((n, t) => n + t.members.length, 0);
  const lastLane = settings.firstLane + game.lanes.length - 1;
  const anyScore = clubs.home.entered + clubs.away.entered > 0;
  /*
   * 믹스팀·완전섞기는 클럽이 아니라 팀(테이블)끼리 겨룬다 — 대시보드도 팀 합계.
   * 순위는 합계로, 동점이면 핸디를 덜 받은 팀이 위 (compareTally).
   */
  const byTeam = game.method !== "clubs";
  const teamTallies = tables.map((t) => tally(t.members, game, settings));
  const teamRank = new Map(
    tables
      .map((t, i) => ({ idx: t.idx, tally: teamTallies[i]! }))
      .sort((a, b) => compareTally(b.tally, a.tally))
      .map((t, r) => [t.idx, r + 1] as const),
  );
  const diff = compareTally(clubs.home, clubs.away);
  const leader = !anyScore || diff === 0 ? null : diff > 0 ? "home" : "away";

  return (
    <div className="screen">
      <div className="resultHead">
        <div className="resultHead__left">
          <div className="resultHead__eyebrow">
            GAME {game.no} · {methodLabel(game.method)} · {placed}명 ·{" "}
            {settings.firstLane}~{lastLane}레인
          </div>
          <div className="resultHead__title">레인 배정</div>
        </div>
      </div>

      {games.length > 1 && (
        <div className="chips">
          {games.map((g) => (
            <button
              type="button"
              key={g.no}
              className={`chip${g.no === game.no ? " chip--on" : ""}`}
              aria-pressed={g.no === game.no}
              onClick={() => setChosen(g.no)}
            >
              GAME {g.no}
            </button>
          ))}
        </div>
      )}

      {byTeam ? (
        <div className="exTeams">
          {tables.map((table, i) => {
            const t = teamTallies[i]!;
            const rank = teamRank.get(table.idx)!;
            const top = anyScore && rank === 1;
            return (
              <div
                className={`exTeams__cell${top ? " exTeams__cell--lead" : ""}`}
                key={table.idx}
              >
                <div className="exTeams__head">
                  <span className="exTeams__name">{table.name}</span>
                  {t.entered > 0 && <span className="exTeams__rank">{rank}위</span>}
                </div>
                <div className="exTeams__total">
                  {t.entered > 0 ? t.total : "–"}
                </div>
                <div className="exBoard__meta">
                  입력 {t.entered}/{t.count}명
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 클럽 합계 — 팀vs팀은 양 클럽이 친 점수(핸디 포함)로 겨룬다. */
        <div className="exBoard">
          {EXCHANGE_SIDES.map((side) => (
            <div
              key={side}
              className={`exBoard__side exBoard__side--${side}${leader === side ? " exBoard__side--lead" : ""}`}
            >
              <div className="exBoard__name">
                <span className={`exDot exDot--${side}`} />
                {teamName(side, settings)}
              </div>
              <div className="exBoard__total">
                {anyScore ? clubs[side].total : "–"}
              </div>
              <div className="exBoard__meta">
                입력 {clubs[side].entered}/{clubs[side].count}명
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="exResults">
        {tables.map((table, i) => {
          const t = teamTallies[i]!;
          return (
            <div
              className="exResult"
              key={table.idx}
              style={{ animationDelay: `${Math.min(i, 9) * 0.04}s` }}
            >
              <div className="exResult__head">
                <span className="exResult__no">{table.name}</span>
                {table.label && (
                  <span className="exResult__label">{table.label}</span>
                )}
                <span className="exResult__sum">
                  {t.entered > 0 ? (
                    <>
                      <em>합계</em>
                      {t.total}
                    </>
                  ) : (
                    <>
                      <em>AVG</em>
                      {table.avg}
                    </>
                  )}
                </span>
              </div>

              {table.lanes.map((lane, k) => (
                <div className="exResult__lane" key={k}>
                  <div className="exResult__laneNo">
                    <strong>{table.firstLane + k}</strong>
                    <span>LANE</span>
                  </div>
                  <div
                    className="exResult__tiles"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(lane.length, 3)}, minmax(0, 1fr))`,
                    }}
                  >
                    {lane.map((p) => {
                      const score = game.scores[p.id];
                      const handi = handicapOf(p, settings);
                      return (
                        <div className="exTile" key={p.id}>
                          <div className="exTile__top">
                            <span className={`exDot exDot--${p.side}`} />
                            <span className="exTile__tier">
                              T{tiers.get(p.id)}
                            </span>
                          </div>
                          <div className="exTile__name">{p.name}</div>
                          <div
                            className={`exTile__score${score === undefined ? " exTile__score--none" : ""}`}
                          >
                            {score ?? "–"}
                            {score !== undefined && handi > 0 && (
                              <em>+{handi}</em>
                            )}
                          </div>
                          <div className="exTile__avg">
                            AVG {p.avg}
                            {handi > 0 && <em>핸디 +{handi}</em>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {isAdmin && (
                <button
                  type="button"
                  className="exResult__enter"
                  onClick={() => onEnterScores(game, table)}
                >
                  {t.entered === 0
                    ? "점수 입력"
                    : t.entered < t.count
                      ? `점수 입력 (${t.entered}/${t.count})`
                      : "점수 수정"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
