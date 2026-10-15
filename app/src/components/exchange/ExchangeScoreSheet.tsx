import { useRef, useState } from 'react';
import { handicapOf, type ExchangeGame, type ExchangeSettings } from '../../exchange/api';
import type { GameTable } from '../../exchange/tables';

const MAX_PINS = 300;

interface Props {
  game: ExchangeGame;
  table: GameTable;
  settings: ExchangeSettings;
  busy: boolean;
  onSave: (entries: { playerId: string; score: number | null }[]) => void;
  onClose: () => void;
}

/** 한 테이블(팀)의 점수를 한 번에 — 점수판 한 장을 보고 옮겨 적는 단위. */
export function ExchangeScoreSheet({ game, table, settings, busy, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      table.members.map((p) => [p.id, game.scores[p.id] === undefined ? '' : String(game.scores[p.id])]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const valueOf = (id: string): number | null => {
    const raw = draft[id] ?? '';
    return raw === '' ? null : Number(raw);
  };

  const total = table.members.reduce((s, p) => {
    const v = valueOf(p.id);
    return v === null ? s : s + v + handicapOf(p, settings);
  }, 0);
  const entered = table.members.filter((p) => valueOf(p.id) !== null).length;

  const submit = () => {
    const bad = table.members.find((p) => {
      const v = valueOf(p.id);
      return v !== null && v > MAX_PINS;
    });
    if (bad) return setError(`${bad.name}: 점수는 0 ~ ${MAX_PINS} 사이로 입력해 주세요.`);
    setError(null);
    onSave(table.members.map((p) => ({ playerId: p.id, score: valueOf(p.id) })));
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="점수 입력">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <div className="sheet__title">
            GAME {game.no} · {table.name} 점수
          </div>
          <button type="button" className="sheet__x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="sheet__hint">
          핸디 없이 친 점수를 넣어 주세요. 여성 핸디는 자동으로 더해집니다. 비우면 점수가 지워져요.
        </div>

        <div className="exScoreRows">
          {table.lanes.map((lane, k) => (
            <div key={k}>
              <div className="exScoreRows__lane">{table.firstLane + k}번 레인</div>
              {lane.map((p) => {
                const at = table.members.indexOf(p);
                const handi = handicapOf(p, settings);
                return (
                  <label className="exScoreRow" key={p.id}>
                    <span className={`exDot exDot--${p.side}`} />
                    <span className="exScoreRow__name">{p.name}</span>
                    <span className="exScoreRow__avg">
                      {p.avg}
                      {handi > 0 && <em>+{handi}</em>}
                    </span>
                    <input
                      ref={(el) => {
                        inputs.current[at] = el;
                      }}
                      className="exScoreRow__input"
                      value={draft[p.id] ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [p.id]: e.target.value.replace(/[^0-9]/g, '').slice(0, 3),
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const next = inputs.current[at + 1];
                        if (next) next.focus();
                        else submit();
                      }}
                      placeholder="–"
                      inputMode="numeric"
                      enterKeyHint={at === table.members.length - 1 ? 'done' : 'next'}
                      autoComplete="off"
                      aria-label={`${p.name} 점수`}
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div className="exScoreSum">
          <span>
            합계 (핸디 포함) · {entered}/{table.members.length}명
          </span>
          <strong>{total}</strong>
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={submit} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
