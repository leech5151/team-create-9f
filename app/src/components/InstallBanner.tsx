interface BannerProps {
  /** The browser can open its own install dialog. */
  canPrompt: boolean;
  isIos: boolean;
  onInstall: () => void;
  onCollapse: () => void;
}

/** What to tell the user, given what this browser actually supports. */
function guidance(canPrompt: boolean, isIos: boolean): string {
  if (canPrompt) return '전체화면으로 열리고, 오프라인에서도 볼 수 있어요.';
  if (isIos) return '공유 버튼 → “홈 화면에 추가”를 누르면 앱처럼 열려요.';
  return '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.';
}

export function InstallBanner({ canPrompt, isIos, onInstall, onCollapse }: BannerProps) {
  return (
    <div className="install">
      <div className="install__icon" aria-hidden="true">
        <span className="install__bar" style={{ background: '#1F5FE0' }} />
        <span className="install__bar" style={{ background: '#0E9D8B' }} />
        <span className="install__bar" style={{ background: '#E0A200' }} />
      </div>
      <div className="install__body">
        <div className="install__title">홈 화면에 앱으로 추가</div>
        <div className="install__sub">{guidance(canPrompt, isIos)}</div>
      </div>
      {canPrompt && (
        <button type="button" className="install__cta" onClick={onInstall}>
          추가
        </button>
      )}
      <button
        type="button"
        className="install__close"
        onClick={onCollapse}
        aria-label="설치 안내 접기"
        title="접기 — 오른쪽 위 설치 버튼으로 다시 열 수 있어요"
      >
        ×
      </button>
    </div>
  );
}

interface PillProps {
  onClick: () => void;
}

/** Collapsed form: a persistent entry point so install is never a dead end. */
export function InstallPill({ onClick }: PillProps) {
  return (
    <button type="button" className="installPill" onClick={onClick}>
      <span className="installPill__icon" aria-hidden="true">
        <span className="installPill__bar" style={{ background: '#1F5FE0' }} />
        <span className="installPill__bar" style={{ background: '#0E9D8B' }} />
        <span className="installPill__bar" style={{ background: '#E0A200' }} />
      </span>
      앱 설치
    </button>
  );
}
