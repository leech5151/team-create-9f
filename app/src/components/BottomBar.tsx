import { TabBar, type TabItem } from './TabBar';
import type { Screen } from '../types';

type TeamTab = 'roster' | 'draw' | 'history';

const TABS: readonly TabItem<TeamTab>[] = [
  { key: 'roster', label: '명단' },
  { key: 'draw', label: '배정' },
  { key: 'history', label: '기록' },
];

interface Props {
  screen: Screen;
  ctaVisible: boolean;
  ctaLabel: string;
  ctaDisabled: boolean;
  resetVisible: boolean;
  onCta: () => void;
  onReset: () => void;
  onTab: (key: TeamTab) => void;
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
              다시 배정
            </button>
          )}
        </div>
      )}
      <TabBar
        tabs={TABS}
        // 결과 화면은 배정 탭의 연장선이므로 배정 탭이 켜진 상태로 둔다.
        isActive={(key) => screen === key || (key === 'draw' && screen === 'result')}
        onSelect={onTab}
      />
    </div>
  );
}
