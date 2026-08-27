import type { Section } from '../types';
import { todayLabel } from '../lib/format';

interface Feature {
  /** Present once the feature is routable; absent while it is still planned. */
  section?: Exclude<Section, 'home'>;
  title: string;
  desc: string;
  bars: [string, string, string];
}

const FEATURES: Feature[] = [
  {
    section: 'league',
    title: '상주리그',
    desc: '순위 · 경기 진행 · 일정 · 선수 명단',
    bars: ['#C93A16', '#FF4A21', '#FF9B7F'],
  },
  {
    section: 'teams',
    title: '팀짜기',
    desc: '점수 순위로 티어를 나눠 레인을 균형 있게 배정',
    bars: ['#1F5FE0', '#0E9D8B', '#E0A200'],
  },
  {
    title: '점수 관리',
    desc: '게임별 점수 기록과 에버리지 추이',
    bars: ['#FF4A21', '#FF7A5C', '#FFB39F'],
  },
  {
    title: '이벤트 게임',
    desc: '이벤트 종목과 결과 기록',
    bars: ['#6B4AE0', '#9B7BF0', '#C4B0FA'],
  },
];

interface Props {
  memberCount: number;
  attendCount: number;
  game: number;
  onOpen: (section: Exclude<Section, 'home'>) => void;
}

export function HomeScreen({ memberCount, attendCount, game, onOpen }: Props) {
  const teamSummary =
    memberCount === 0
      ? '멤버를 등록하면 시작할 수 있어요'
      : `멤버 ${memberCount}명 · 참석 ${attendCount}명 · GAME ${game}`;

  return (
    <div className="screen">
      <div className="eyebrow">{todayLabel()}</div>
      <div className="title">무엇을 할까요?</div>

      <div className="features">
        {FEATURES.map((f) => {
          const ready = f.section !== undefined;
          return (
            <button
              type="button"
              key={f.title}
              className={`feature${ready ? '' : ' feature--soon'}`}
              disabled={!ready}
              onClick={() => f.section && onOpen(f.section)}
            >
              <span className="feature__icon" aria-hidden="true">
                {f.bars.map((c, i) => (
                  <span key={i} className="feature__bar" style={{ background: c }} />
                ))}
              </span>
              <span className="feature__body">
                <span className="feature__titleRow">
                  <span className="feature__title">{f.title}</span>
                  {!ready && <span className="feature__badge">준비 중</span>}
                </span>
                <span className="feature__desc">{f.desc}</span>
                {ready && f.section === 'teams' && (
                  <span className="feature__meta">{teamSummary}</span>
                )}
              </span>
              {ready && (
                <span className="feature__chevron" aria-hidden="true">
                  ›
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
