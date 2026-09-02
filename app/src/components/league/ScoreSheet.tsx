import { useMemo, useState } from 'react';
import type { GameScoreRow, Match, ScoreEntry } from '../../league/api';
import type { GameNo, LeaguePlayer, SideInput } from '../../league/types';
import { fixtureHandicaps, scoreMatch, type Decision } from '../../league/scoring';
import { parseDate, shortDate } from '../../league/schedule';

const GAMES: readonly GameNo[] = [1, 2, 3];
const MAX_PINS = 300;

/** Keyed `playerId:gameNo` so a flat map covers both teams. */
type Draft = Record<string, string>;

const keyOf = (playerId: string, gameNo: GameNo) => `${playerId}:${gameNo}`;

interface Side {
  teamId: string;
  teamName: string;
  roster: readonly LeaguePlayer[];
}

interface Props {
  match: Match;
  home: Side;
  away: Side;
  /** Scores already recorded for this match. */
  existing: readonly GameScoreRow[];
  /**
   * Look, don't touch — the same sheet doubles as 경기상세 on 경기일정, where
   * participants read a recorded night. Omit `onSave` alongside it.
   */
  readOnly?: boolean;
  onSave?: (entries: ScoreEntry[]) => Promise<string | null>;
  onClose: () => void;
}

export function ScoreSheet({ match, home, away, existing, readOnly = false, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {};
    for (const row of existing) d[keyOf(row.playerId, row.gameNo)] = String(row.pins);
    return d;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (playerId: string, gameNo: GameNo, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 3);
    setDraft((d) => ({ ...d, [keyOf(playerId, gameNo)]: digits }));
  };

  const numberAt = (playerId: string, gameNo: GameNo): number | null => {
    const raw = draft[keyOf(playerId, gameNo)];
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  /**
   * The fixture handicap each side carries, from the two line-ups' 점수 totals.
   * Computed here as well as in `scoreMatch` so the grid's running numbers
   * match the result preview instead of being one handicap short.
   */
  const strengthOf = (side: Side) => side.roster.reduce((s, p) => s + (p.avg ?? 0), 0);
  const extras = fixtureHandicaps(strengthOf(home), strengthOf(away));
  const extraOf = (side: Side) => (side.teamId === home.teamId ? extras.home : extras.away);

  /** Sum of the line-up's own adjustments, applied once to each game. */
  const rosterAdjust = (side: Side) =>
    side.roster.reduce((s, p) => s + p.handicap - p.penalty, 0);

  /** Team pins for one game, as bowled. Null when nobody's score is in yet. */
  const gameScratch = (side: Side, gameNo: GameNo): number | null => {
    let pins = 0;
    let entered = 0;
    for (const p of side.roster) {
      const v = numberAt(p.id, gameNo);
      if (v === null) continue;
      pins += v;
      entered += 1;
    }
    return entered === 0 ? null : pins;
  };

  /**
   * Team total for one game: the entered pins plus the adjustment of every
   * player who bowled it, plus the fixture handicap. Shown per game so the
   * operator can check a night game by game, not only on the match total.
   */
  const gameTotal = (side: Side, gameNo: GameNo): number | null => {
    let pins = 0;
    let adjust = 0;
    let entered = 0;
    for (const p of side.roster) {
      const v = numberAt(p.id, gameNo);
      if (v === null) continue;
      pins += v;
      adjust += p.handicap - p.penalty;
      entered += 1;
    }
    return entered === 0 ? null : pins + adjust + extraOf(side);
  };

  /**
   * Totals over the games actually entered.
   *
   * Adjustments count per entered game, not a flat ×3 — otherwise a half-filled
   * sheet shows a full match's worth of handicap against one game's worth of
   * pins, which reads as if nothing were applied correctly. The fixture
   * handicap likewise lands once per game that has any score in it.
   */
  const sideTotals = (side: Side) => {
    let scratch = 0;
    let adjust = 0;
    let entered = 0;
    const extra = extraOf(side);
    for (const g of GAMES) {
      let inGame = 0;
      for (const p of side.roster) {
        const v = numberAt(p.id, g);
        if (v === null) continue;
        scratch += v;
        adjust += p.handicap - p.penalty;
        inGame += 1;
      }
      if (inGame > 0) adjust += extra;
      entered += inGame;
    }
    const slots = side.roster.length * GAMES.length;
    return { scratch, adjust, total: scratch + adjust, entered, slots };
  };

  const homeTotals = sideTotals(home);
  const awayTotals = sideTotals(away);
  const complete =
    homeTotals.entered === homeTotals.slots &&
    awayTotals.entered === awayTotals.slots &&
    homeTotals.slots > 0;

  /** Live result once every slot is filled, so the operator can sanity-check it. */
  const preview = useMemo(() => {
    if (!complete) return null;
    const toSide = (side: Side): SideInput => ({
      teamId: side.teamId,
      lineup: side.roster.map((p) => ({
        playerId: p.id,
        handicap: p.handicap,
        penalty: p.penalty,
        avg: p.avg,
      })),
      scores: side.roster.flatMap((p) =>
        GAMES.map((g) => ({ playerId: p.id, gameNo: g, pins: numberAt(p.id, g) ?? 0 })),
      ),
    });
    return scoreMatch(toSide(home), toSide(away));
    // `draft` drives every number read inside; `complete` gates the whole thing.
  }, [draft, complete, home, away]);

  const submit = async () => {
    if (!onSave) return;
    const entries: ScoreEntry[] = [];
    for (const side of [home, away]) {
      for (const p of side.roster) {
        for (const g of GAMES) {
          const raw = draft[keyOf(p.id, g)];
          if (raw === undefined || raw === '') {
            entries.push({ playerId: p.id, gameNo: g, pins: null });
            continue;
          }
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0 || n > MAX_PINS) {
            return setError(`${p.name} ${g}게임: 0~${MAX_PINS} 사이로 입력해 주세요.`);
          }
          entries.push({ playerId: p.id, gameNo: g, pins: n });
        }
      }
    }

    setBusy(true);
    setError(null);
    const message = await onSave(entries);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  const renderSide = (side: Side, totals: ReturnType<typeof sideTotals>) => {
    // What every game of this side carries before a single pin is counted.
    const perGame = rosterAdjust(side) + extraOf(side);
    return (
      <div className="scoreTeam">
        <div className="scoreTeam__head">
          <span className="scoreTeam__name">{side.teamName}</span>
          <span className="scoreTeam__total">
            {totals.entered === 0 ? '–' : totals.total}
            {totals.entered > 0 && totals.adjust !== 0 && (
              <em className="scoreTeam__work">
                (실투 {totals.scratch} {totals.adjust > 0 ? `+${totals.adjust}` : totals.adjust})
              </em>
            )}
            {totals.entered > 0 && totals.entered < totals.slots && (
              <em className="scoreTeam__partial">{totals.slots - totals.entered}칸 남음</em>
            )}
          </span>
        </div>

        {side.roster.length === 0 ? (
          <div className="hintBox hintBox--tight">선수가 배정되지 않은 팀입니다.</div>
        ) : (
          <div className="scoreGrid">
            <div className="scoreGrid__head">
              <span />
              {GAMES.map((g) => (
                <span key={g} className="scoreGrid__gh">
                  {g}G
                </span>
              ))}
              <span className="scoreGrid__gh">합</span>
            </div>
            {side.roster.map((p) => {
              const vals = GAMES.map((g) => numberAt(p.id, g));
              const sum = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
              const any = vals.some((v) => v !== null);
              const adj = p.handicap - p.penalty;
              return (
                <div className="scoreGrid__row" key={p.id}>
                  <span className="scoreGrid__name">
                    {p.name}
                    {adj !== 0 && (
                      <em className={`scoreGrid__adj${adj < 0 ? ' scoreGrid__adj--pen' : ''}`}>
                        {adj > 0 ? `+${adj}` : adj}
                      </em>
                    )}
                  </span>
                  {GAMES.map((g, i) =>
                    readOnly ? (
                      <span key={g} className="scoreGrid__cell">
                        {vals[i] ?? '–'}
                      </span>
                    ) : (
                      <input
                        key={g}
                        className="scoreGrid__input"
                        value={draft[keyOf(p.id, g)] ?? ''}
                        onChange={(e) => set(p.id, g, e.target.value)}
                        inputMode="numeric"
                        placeholder="–"
                        aria-label={`${p.name} ${g}게임`}
                      />
                    ),
                  )}
                  <span className="scoreGrid__sum">{any ? sum : '–'}</span>
                </div>
              );
            })}

            {/*
              Two rows per game, so it is plain which number is which: the
              pins as bowled, then the same game with 핸디·패널티·대진 핸디
              applied — the figure that actually decides the game.
            */}
            <div className="scoreGrid__row scoreGrid__row--sum">
              <span className="scoreGrid__name">게임 실투 합</span>
              {GAMES.map((g) => (
                <span className="scoreGrid__gsum scoreGrid__gsum--raw" key={g}>
                  {gameScratch(side, g) ?? '–'}
                </span>
              ))}
              <span className="scoreGrid__sum scoreGrid__sum--raw">
                {totals.entered === 0 ? '–' : totals.scratch}
              </span>
            </div>
            <div className="scoreGrid__row scoreGrid__row--applied">
              <span className="scoreGrid__name">
                핸디 적용 합
                {perGame !== 0 && (
                  <em
                    className={`scoreGrid__adj${perGame < 0 ? ' scoreGrid__adj--pen' : ''}`}
                    title="게임마다 더해지는 핸디·패널티·대진 핸디의 합"
                  >
                    {perGame > 0 ? `+${perGame}` : perGame}
                  </em>
                )}
              </span>
              {GAMES.map((g) => (
                <span className="scoreGrid__gsum" key={g}>
                  {gameTotal(side, g) ?? '–'}
                </span>
              ))}
              <span className="scoreGrid__sum">{totals.entered === 0 ? '–' : totals.total}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="경기 기록">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{readOnly ? '경기 상세' : '경기 기록'}</div>
        <div className="sheet__hint">
          {match.playedOn ? shortDate(parseDate(match.playedOn)!) : '날짜 미정'}
          {match.startTime ? ` ${match.startTime}` : ''} ·{' '}
          {match.laneNo === null ? '레인 미정' : `${match.laneNo}번 레인`} —{' '}
          {readOnly
            ? '조회 전용입니다. 기록은 운영자만 수정할 수 있어요.'
            : '실투 점수를 넣으면 핸디·패널티는 자동 반영됩니다.'}
        </div>

        {renderSide(home, homeTotals)}
        {renderSide(away, awayTotals)}

        {preview ? (
          <div className="scorePreview">
            <div className="scorePreview__head">
              <span>{home.teamName}</span>
              <span className="scorePreview__pts">
                {preview.homePoints} : {preview.awayPoints}
              </span>
              <span>{away.teamName}</span>
            </div>
            <div className="scorePreview__work">
              실투 {preview.home.scratchTotal} : {preview.away.scratchTotal} → 핸디·패널티 반영{' '}
              {preview.home.grandTotal} : {preview.away.grandTotal}
            </div>
            <div className="scorePreview__games">
              {preview.gameDecisions.map((d, i) => (
                <span key={i} className="scorePreview__game">
                  <span className="scorePreview__gameNo">{i + 1}G</span>
                  <span className="scorePreview__gameScore">
                    {preview.home.games[i]!.total} : {preview.away.games[i]!.total}
                  </span>
                  <Winner decision={d} home={home.teamName} away={away.teamName} />
                  {d.brokenBy && <em className="scorePreview__rule">{d.brokenBy}</em>}
                </span>
              ))}
              <span className="scorePreview__game">
                <span className="scorePreview__gameNo">총점</span>
                <span className="scorePreview__gameScore">
                  {preview.home.grandTotal} : {preview.away.grandTotal}
                </span>
                <Winner
                  decision={preview.totalDecision}
                  home={home.teamName}
                  away={away.teamName}
                />
              </span>
            </div>
          </div>
        ) : (
          <div className="hintBox hintBox--tight">
            {readOnly
              ? homeTotals.entered + awayTotals.entered === 0
                ? '아직 기록되지 않은 경기입니다.'
                : '기록이 일부만 들어와 승패는 아직 계산되지 않았어요.'
              : '양 팀 9칸씩 모두 채우면 승패와 승점이 계산됩니다. 지금 저장해도 입력한 만큼 보관돼요.'}
          </div>
        )}

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          {!readOnly && (
            <button
              type="button"
              className="sheet__save"
              onClick={() => void submit()}
              disabled={busy}
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          )}
          <button
            type="button"
            className={readOnly ? 'sheet__save' : 'sheet__ghost'}
            onClick={onClose}
          >
            {readOnly ? '확인' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Who took the point, named outright. Arrows read as "someone won" without
 * saying who, which is exactly the thing a participant is looking for.
 */
function Winner({ decision, home, away }: { decision: Decision; home: string; away: string }) {
  if (decision.home === decision.away) {
    return <em className="winner winner--draw">동점</em>;
  }
  const homeWon = decision.home > decision.away;
  return (
    <em className={`winner winner--${homeWon ? 'home' : 'away'}`}>{homeWon ? home : away} 승</em>
  );
}
