import type { LeagueTab } from '../types';

/**
 * 상주리그 shell. Each tab is scaffolded with the intent stated up front, so the
 * navigation is real and reviewable before any league data model exists.
 */

interface TabSpec {
  eyebrow: string;
  title: string;
  /** What this tab is for — shown in the empty state, not invented data. */
  blurb: string;
  planned: string[];
}

const SPECS: Record<LeagueTab, TabSpec> = {
  main: {
    eyebrow: '상주리그',
    title: '리그 메인',
    blurb: '현재 시즌 순위와 최근 경기 결과를 한눈에 보는 화면입니다.',
    planned: ['시즌 순위표', '최근 경기 결과', '개인 기록 상위'],
  },
  play: {
    eyebrow: '상주리그',
    title: '경기 진행',
    blurb: '진행 중인 경기의 점수를 입력하고 결과를 확정하는 화면입니다.',
    planned: ['게임별 점수 입력', '핸디캡 반영', '경기 결과 확정'],
  },
  schedule: {
    eyebrow: '상주리그',
    title: '경기 일정',
    blurb: '라운드별 대전 일정과 장소를 관리하는 화면입니다.',
    planned: ['라운드별 대전표', '날짜·레인 배정', '일정 등록·수정'],
  },
  players: {
    eyebrow: '상주리그',
    title: '선수 명단',
    blurb: '리그 참가 선수와 소속, 에버리지를 관리하는 화면입니다.',
    planned: ['선수 등록·수정', '팀·소속 구분', '에버리지와 핸디캡'],
  },
};

interface Props {
  tab: LeagueTab;
}

export function LeagueScreen({ tab }: Props) {
  const spec = SPECS[tab];

  return (
    <div className="screen">
      <div className="eyebrow">{spec.eyebrow}</div>
      <div className="title">{spec.title}</div>

      <div className="blank">
        <div className="blank__title">아직 만들지 않았어요</div>
        <div className="blank__sub">{spec.blurb}</div>
        <ul className="plannedList">
          {spec.planned.map((item) => (
            <li className="plannedList__item" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
