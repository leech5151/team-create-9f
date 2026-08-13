interface Props {
  /** true = browser install dialog available, false = iOS manual instructions. */
  canInstall: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export function InstallBanner({ canInstall, onInstall, onDismiss }: Props) {
  return (
    <div className="install">
      <div className="install__icon" aria-hidden="true">
        <span className="install__bar" style={{ background: '#1F5FE0' }} />
        <span className="install__bar" style={{ background: '#0E9D8B' }} />
        <span className="install__bar" style={{ background: '#E0A200' }} />
      </div>
      <div className="install__body">
        <div className="install__title">홈 화면에 앱으로 추가</div>
        <div className="install__sub">
          {canInstall
            ? '전체화면으로 열리고, 오프라인에서도 배정할 수 있어요.'
            : '공유 버튼 → “홈 화면에 추가”를 누르면 앱처럼 열려요.'}
        </div>
      </div>
      {canInstall && (
        <button type="button" className="install__cta" onClick={onInstall}>
          추가
        </button>
      )}
      <button type="button" className="install__close" onClick={onDismiss} aria-label="닫기">
        ×
      </button>
    </div>
  );
}
