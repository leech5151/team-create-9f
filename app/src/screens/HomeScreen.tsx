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
    section: 'meetup',
    title: '정모 팀짜기',
    desc: '날짜별로 저장하고 참석자 모두가 같은 배정을 봅니다',
    bars: ['#1F5FE0', '#4A82EA', '#9BBAF5'],
  },
  {
    section: 'flash',
    title: '번개 팀짜기',
    desc: '저장 없이 지금 한 번 — 이 기기에만 남습니다',
    bars: ['#0E9D8B', '#39BDAC', '#A8E2DA'],
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
  /** Date of the most recently saved 정모, or null when none exists yet. */
  latestMeetup: string | null;
  onOpen: (section: Exclude<Section, 'home'>) => void;
}

export function HomeScreen({ memberCount, attendCount, game, latestMeetup, onOpen }: Props) {
  /** 번개는 이 브라우저에 남아 있는 명단이 곧 다음 판의 출발점이다. */
  const flashSummary =
    memberCount === 0
      ? '멤버를 등록하면 시작할 수 있어요'
      : `멤버 ${memberCount}명 · 참석 ${attendCount}명 · GAME ${game}`;
  const meetupSummary =
    latestMeetup === null ? '저장된 정모가 없어요' : `최근 정모 ${latestMeetup}`;

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
                {f.section === 'flash' && <span className="feature__meta">{flashSummary}</span>}
                {f.section === 'meetup' && <span className="feature__meta">{meetupSummary}</span>}
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
