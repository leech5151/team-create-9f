import { useState } from 'react';

interface Props {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onClose: () => void;
}

export function LoginSheet({ onSignIn, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError('이메일과 비밀번호를 입력해 주세요.');
    setBusy(true);
    setError(null);
    const message = await onSignIn(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="운영자 로그인">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">운영자 로그인</div>
        <div className="sheet__hint">
          기록을 보는 데는 로그인이 필요 없습니다. 등록·수정할 때만 필요합니다.
        </div>

        <div className="field">
          <label className="field__label" htmlFor="admin-email">
            이메일
          </label>
          <input
            id="admin-email"
            className="field__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="admin-password">
            비밀번호
          </label>
          <input
            id="admin-password"
            className="field__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
