export interface TabItem<K extends string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  tabs: readonly TabItem<K>[];
  /** Which tab reads as active — not always equal to the current screen. */
  isActive: (key: K) => boolean;
  onSelect: (key: K) => void;
}

/** Shared bottom tab strip. Each feature supplies its own tab list. */
export function TabBar<K extends string>({ tabs, isActive, onSelect }: Props<K>) {
  return (
    // Labels shrink once there are enough tabs to crowd a phone width.
    <div className={`tabs${tabs.length > 4 ? ' tabs--many' : ''}`} role="tablist">
      {tabs.map((t) => {
        const on = isActive(t.key);
        return (
          <button
            type="button"
            key={t.key}
            role="tab"
            aria-selected={on}
            className={`tab${on ? ' tab--on' : ''}`}
            onClick={() => onSelect(t.key)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
