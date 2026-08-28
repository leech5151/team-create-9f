import { useState } from 'react';
import type { PlayerDraft } from '../league/api';
import type { LeaguePlayer } from '../league/types';

const GENDERS = ['남', '여'] as const;

interface Props {
  player: LeaguePlayer;
  onSave: (draft: PlayerDraft) => Promise<string | null>;
  onDelete: (player: LeaguePlayer) => Promise<string | null>;
  onClose: () => void;
}

export function PlayerSheet({ player, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(player.name);
  const [gender, setGender] = useState<'남' | '여' | null>(player.gender);
  const [handicap, setHandicap] = useState(String(player.handicap));
  const [penalty, setPenalty] = useState(String(player.penalty));
  const [avg, setAvg] = useState(player.avg === null ? '' : String(player.avg));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const message = await action();
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('이름을 입력해 주세요.');
    const parsedAvg = avg.trim() === '' ? null : Number(avg);
    if (parsedAvg !== null && (!Number.isFinite(parsedAvg) || parsedAvg < 0 || parsedAvg > 300)) {
      return setError('점수는 0~300 사이여야 합니다.');
    }
    void run(() =>
      onSave({
        name: trimmed,
        gender,
        handicap: handicap.trim() === '' ? 0 : Number(handicap),
        penalty: penalty.trim() === '' ? 0 : Number(penalty),
        avg: parsedAvg,
      }),
    );
  };

  /** Magnitude only — the field's meaning supplies the sign. */
  const numeric = (raw: string) => raw.replace(/[^0-9]/g, '').slice(0, 3);

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="선수 수정">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">선수 수정</div>

        <div className="field">
          <label className="field__label" htmlFor="player-name">
            이름
          </label>
          <input
            id="player-name"
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            maxLength={20}
          />
        </div>

        <div className="field">
          <span className="field__label">성별</span>
          <div className="optRow">
            {GENDERS.map((g) => (
              <button
                type="button"
                key={g}
                className={`optBtn${gender === g ? ' optBtn--on' : ''}`}
                aria-pressed={gender === g}
                onClick={() => setGender(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">기본 수치</span>
          <div className="figureRow">
            <label className="figure">
              <span className="figure__label">핸디 +</span>
              <input
                className="figure__input"
                value={handicap}
                onChange={(e) => setHandicap(numeric(e.target.value))}
                placeholder="0"
                inputMode="numeric"
              />
            </label>
            <label className="figure">
              <span className="figure__label">패널티 −</span>
              <input
                className="figure__input"
                value={penalty}
                onChange={(e) => setPenalty(numeric(e.target.value))}
                placeholder="0"
                inputMode="numeric"
              />
            </label>
            <label className="figure">
              <span className="figure__label">점수</span>
              <input
                className="figure__input"
                value={avg}
                onChange={(e) => setAvg(numeric(e.target.value))}
                placeholder="–"
                inputMode="numeric"
              />
            </label>
          </div>
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={submit} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <button
            type="button"
            className="sheet__ghost sheet__delete"
            disabled={busy}
            onClick={() => void run(() => onDelete(player))}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
