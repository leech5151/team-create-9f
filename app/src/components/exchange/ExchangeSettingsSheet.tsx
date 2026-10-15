import { useState } from 'react';
import type { ExchangeSettings } from '../../exchange/api';

const MAX_HANDICAP = 100;

interface Props {
  settings: ExchangeSettings;
  busy: boolean;
  onSave: (next: ExchangeSettings) => void;
  onClose: () => void;
}

/** 팀 이름과 여성 핸디 — 교류전 전체에 한 벌만 있는 설정. */
export function ExchangeSettingsSheet({ settings, busy, onSave, onClose }: Props) {
  const [homeName, setHomeName] = useState(settings.homeName);
  const [awayName, setAwayName] = useState(settings.awayName);
  const [handicapOn, setHandicapOn] = useState(settings.femaleHandicapOn);
  const [handicap, setHandicap] = useState(String(settings.femaleHandicap));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const home = homeName.trim();
    const away = awayName.trim();
    if (!home || !away) return setError('두 팀 이름을 모두 입력해 주세요.');
    if (home === away) return setError('두 팀 이름이 같습니다.');
    const parsed = handicap.trim() === '' ? 0 : Number(handicap);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_HANDICAP) {
      return setError(`여성 핸디는 0 ~ ${MAX_HANDICAP} 사이로 입력해 주세요.`);
    }
    if (handicapOn && parsed === 0) return setError('적용할 여성 핸디를 입력해 주세요.');
    setError(null);
    onSave({
      ...settings,
      homeName: home,
      awayName: away,
      femaleHandicapOn: handicapOn,
      // 끈 상태에서도 값은 남겨 둔다 — 다시 켤 때 또 입력하지 않도록.
      femaleHandicap: Math.round(parsed),
    });
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="교류전 설정">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <div className="sheet__title">교류전 설정</div>
          <button type="button" className="sheet__x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="sheet__hint">회차 없이 지금 설정 하나만 저장됩니다.</div>

        <div className="field">
          <label className="field__label" htmlFor="exchange-home">
            우리 팀 이름
          </label>
          <input
            id="exchange-home"
            className="field__input"
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            autoComplete="off"
            maxLength={20}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="exchange-away">
            상대 팀 이름
          </label>
          <input
            id="exchange-away"
            className="field__input"
            value={awayName}
            onChange={(e) => setAwayName(e.target.value)}
            autoComplete="off"
            maxLength={20}
          />
        </div>

        <div className="field">
          <span className="field__label">여성 핸디</span>
          <div className="optRow">
            {([true, false] as const).map((on) => (
              <button
                type="button"
                key={String(on)}
                className={`optBtn${handicapOn === on ? ' optBtn--on' : ''}`}
                aria-pressed={handicapOn === on}
                onClick={() => setHandicapOn(on)}
              >
                {on ? '적용' : '미적용'}
              </button>
            ))}
          </div>
        </div>

        {handicapOn && (
          <div className="field">
            <label className="field__label" htmlFor="exchange-handicap">
              핸디 (게임당, 여성 일괄)
            </label>
            <input
              id="exchange-handicap"
              className="field__input"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              placeholder="15"
              inputMode="numeric"
              autoComplete="off"
            />
            <div className="field__note">양 팀 여성 선수 모두에게 같은 값이 더해집니다.</div>
          </div>
        )}

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
