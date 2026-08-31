import { useMemo, useState } from 'react';
import type { GameScoreRow, Match, ScoreEntry } from '../../league/api';
import type { GameNo, LeaguePlayer, SideInput } from '../../league/types';
import { scoreMatch } from '../../league/scoring';
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
  onSave: (entries: ScoreEntry[]) => Promise<string | null>;
  onClose: () => void;
}

export function ScoreSheet({ match, home, away, existing, onSave, onClose }: Props) {
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
   * Totals over the games actually entered.
   *
   * The adjustment is applied per entered game, not a flat ×3 — otherwise a
   * half-filled sheet shows a full match's worth of handicap against one
   * game's worth of pins, which reads as if nothing were applied correctly.
   */
  const sideTotals = (side: Side) => {
    let scratch = 0;
    let adjust = 0;
    let entered = 0;
    for (const p of side.roster) {
      const perGame = p.handicap - p.penalty;
      for (const g of GAMES) {
        const v = numberAt(p.id, g);
        if (v !== null) {
          scratch += v;
          adjust += perGame;
          entered += 1;
        }
      }
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
      })),
      scores: side.roster.flatMap((p) =>
        GAMES.map((g) => ({ playerId: p.id, gameNo: g, pins: numberAt(p.id, g) ?? 0 })),
      ),
    });
    return scoreMatch(toSide(home), toSide(away));
    // `draft` drives every number read inside; `complete` gates the whole thing.
  }, [draft, complete, home, away]);

  const submit = async () => {
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

  const renderSide = (side: Side, totals: ReturnType<typeof sideTotals>) => (
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
                {GAMES.map((g) => (
                  <input
                    key={g}
                    className="scoreGrid__input"
                    value={draft[keyOf(p.id, g)] ?? ''}
                    onChange={(e) => set(p.id, g, e.target.value)}
                    inputMode="numeric"
                    placeholder="–"
                    aria-label={`${p.name} ${g}게임`}
                  />
                ))}
                <span className="scoreGrid__sum">{any ? sum : '–'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="경기 기록">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">경기 기록</div>
        <div className="sheet__hint">
          {match.playedOn ? shortDate(parseDate(match.playedOn)!) : '날짜 미정'}
          {match.startTime ? ` ${match.startTime}` : ''} ·{' '}
          {match.laneNo === null ? '레인 미정' : `${match.laneNo}번 레인`} — 실투 점수를 넣으면
          핸디·패널티는 자동 반영됩니다.
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
                  {i + 1}G {preview.home.games[i]!.total}:{preview.away.games[i]!.total}
                  <em>{d.home > d.away ? '◀' : d.home < d.away ? '▶' : '='}</em>
                  {d.brokenBy && <em className="scorePreview__rule">{d.brokenBy}</em>}
                </span>
              ))}
              <span className="scorePreview__game">
                총점 {preview.home.grandTotal}:{preview.away.grandTotal}
                <em>
                  {preview.totalDecision.home > preview.totalDecision.away
                    ? '◀'
                    : preview.totalDecision.home < preview.totalDecision.away
                      ? '▶'
                      : '='}
                </em>
              </span>
            </div>
          </div>
        ) : (
          <div className="hintBox hintBox--tight">
            양 팀 9칸씩 모두 채우면 승패와 승점이 계산됩니다. 지금 저장해도 입력한 만큼 보관돼요.
          </div>
        )}

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
