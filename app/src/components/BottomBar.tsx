import type { Screen } from '../types';

const TABS: [key: 'roster' | 'draw' | 'history', label: string][] = [
  ['roster', '명단'],
  ['draw', '배정'],
  ['history', '기록'],
];

interface Props {
  screen: Screen;
  ctaVisible: boolean;
  ctaLabel: string;
  ctaDisabled: boolean;
  resetVisible: boolean;
  onCta: () => void;
  onReset: () => void;
  onTab: (key: 'roster' | 'draw' | 'history') => void;
}

export function BottomBar({
  screen,
  ctaVisible,
  ctaLabel,
  ctaDisabled,
  resetVisible,
  onCta,
  onReset,
  onTab,
}: Props) {
  return (
    <div className="app__bottom">
      {ctaVisible && (
        <div className="cta">
          <button type="button" className="cta__main" onClick={onCta} disabled={ctaDisabled}>
            {ctaLabel}
          </button>
          {resetVisible && (
            <button type="button" className="cta__reset" onClick={onReset}>
              전체 초기화
            </button>
          )}
        </div>
      )}
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => {
          // 결과 화면은 배정 탭의 연장선이므로 배정 탭이 켜진 상태로 둔다.
          const on = screen === key || (key === 'draw' && screen === 'result');
          return (
            <button
              type="button"
              key={key}
              role="tab"
              aria-selected={on}
              className={`tab${on ? ' tab--on' : ''}`}
              onClick={() => onTab(key)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
