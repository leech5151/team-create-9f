import type { Gender, Member } from '../types';

/**
 * Sample roster from the design prototype (30 members).
 *
 * NOT loaded on first run — the app starts with an empty roster so the user
 * enters their own members. This is only pulled in when they tap
 * "예시 명단 불러오기" on the empty state.
 *
 * No tier column: tier is derived from `avg` across whoever is attending.
 */
const RAW: [name: string, gender: Gender, avg: number][] = [
  ['김민준', '남', 210],
  ['이서준', '남', 205],
  ['박도윤', '남', 198],
  ['최예준', '남', 203],
  ['정시우', '남', 212],
  ['강하준', '여', 196],
  ['조지호', '남', 201],
  ['윤주원', '여', 207],
  ['장지후', '남', 199],
  ['임준서', '남', 194],
  ['한건우', '남', 178],
  ['오현우', '남', 172],
  ['서지안', '여', 169],
  ['신도현', '남', 175],
  ['권태영', '남', 166],
  ['황민서', '여', 171],
  ['안유진', '여', 163],
  ['송하윤', '여', 174],
  ['배수아', '여', 168],
  ['홍지우', '남', 176],
  ['문채원', '여', 142],
  ['유서연', '여', 138],
  ['남기훈', '남', 145],
  ['심우진', '남', 133],
  ['노아린', '여', 140],
  ['백승호', '남', 136],
  ['고은서', '여', 148],
  ['하지민', '여', 131],
  ['전다인', '여', 144],
  ['구현서', '남', 139],
];

export const SAMPLE_ROSTER: Member[] = RAW.map(([name, gender, avg], i) => ({
  id: `m${i + 1}`,
  name,
  gender,
  avg,
}));

/** Members the prototype started with unchecked. */
const SAMPLE_ABSENT = new Set(['임준서', '배수아', '구현서', '장지후', '홍지우', '전다인']);

export const SAMPLE_ATTEND: Record<string, boolean> = Object.fromEntries(
  SAMPLE_ROSTER.map((m) => [m.id, !SAMPLE_ABSENT.has(m.name)]),
);

/** GAME 1 result the prototype pre-seeded so 중복 방지 has something to avoid. */
const SAMPLE_GAME_1_NAMES = [
  ['정시우', '한건우', '문채원'],
  ['김민준', '안유진', '남기훈'],
  ['최예준', '신도현', '하지민'],
  ['이서준', '황민서', '고은서'],
  ['윤주원', '오현우', '백승호'],
  ['조지호', '송하윤', '유서연'],
  ['박도윤', '권태영', '심우진'],
  ['강하준', '서지안', '노아린'],
];

const idByName = new Map(SAMPLE_ROSTER.map((m) => [m.name, m.id]));

export const SAMPLE_HISTORY = [
  {
    game: 1,
    lanes: SAMPLE_GAME_1_NAMES.map((lane) =>
      lane.map((name) => idByName.get(name)).filter((id): id is string => id !== undefined),
    ),
  },
];
