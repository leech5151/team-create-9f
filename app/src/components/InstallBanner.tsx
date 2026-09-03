interface PillProps {
  onClick: () => void;
}

/**
 * The whole install affordance: one app-bar button, shown for as long as the
 * app is running in a browser tab. There is no banner — an install prompt that
 * takes over the top of the screen competes with the task the user came for.
 */
export function InstallPill({ onClick }: PillProps) {
  return (
    <button type="button" className="installPill" onClick={onClick} title="앱 설치">
      <span className="installPill__icon" aria-hidden="true">
        <span className="installPill__bar" style={{ background: '#1F5FE0' }} />
        <span className="installPill__bar" style={{ background: '#0E9D8B' }} />
        <span className="installPill__bar" style={{ background: '#E0A200' }} />
      </span>
      앱 설치
    </button>
  );
}