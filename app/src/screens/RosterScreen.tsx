import { useState } from 'react';
import type { Member, Options, Tier } from '../types';
import { TIERS } from '../types';
import { TIER_COLOR } from '../theme';
import { MAX_LANE_NO } from '../lib/assign';
import { todayLabel } from '../lib/format';
import type { Meetup } from '../meetup/api';
import { MeetupCalendar } from '../components/MeetupCalendar';
import { parseDate, weekdayLabel } from '../league/schedule';
import type { LoadState } from '../league/useLeague';

const OPTION_LABELS: [key: keyof Options, label: string][] = [
  ['balance', '에버리지 균형'],
  ['gender', '성별 분배'],
  ['avoid', '중복 방지'],
];

interface Props {
  roster: readonly Member[];
  attend: Readonly<Record<string, boolean>>;
  /** Derived tier per attending member — absent members are not in the map. */
  tiers: ReadonlyMap<string, Tier>;
  opts: Options;
  attendCount: number;
  laneCount: number;
  /** Players per lane for the planned draw, e.g. [2,3,2,3]. */
  laneSizes: readonly number[];
  minLaneCount: number;
  autoLaneCount: number;
  laneCountChosen: boolean;
  onChangeLaneCount: (laneCount: number | null) => void;
  /** Lane number the block starts at — 8 lanes from 3 means 3~10. */
  firstLane: number;
  onChangeFirstLane: (firstLane: number) => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  onToggleAttend: (id: string) => void;
  onSetAllAttend: (attending: boolean) => void;
  onToggleOption: (key: keyof Options) => void;
  onEditMember: (member: Member) => void;
  onDeleteMember: (member: Member) => void;
  onAddMembers: () => void;
  onLoadSample: () => void;
  onResetData: () => void;
  /** Operators can save a 정모; everyone else can only open a saved one. */
  isAdmin: boolean;
  /** Date of the 정모 being edited, or null for the browser-only session draw. */
  meetupOn: string | null;
  meetups: readonly Meetup[];
  meetupState: LoadState;
  meetupBusy: boolean;
  onOpenMeetup: (metOn: string) => void;
  onCloseMeetup: () => void;
  onSaveMeetup: (metOn: string) => void;
  onDeleteMeetup: (metOn: string) => void;
  /** Today as an ISO date — the default target for a new 정모. */
  today: string;
}

const byScore = (a: Member, b: Member) => b.avg - a.avg || a.name.localeCompare(b.name, 'ko');

export function RosterScreen({
  roster,
  attend,
  tiers,
  opts,
  attendCount,
  laneCount,
  laneSizes,
  minLaneCount,
  autoLaneCount,
  laneCountChosen,
  onChangeLaneCount,
  firstLane,
  onChangeFirstLane,
  editMode,
  onToggleEditMode,
  onToggleAttend,
  onSetAllAttend,
  onToggleOption,
  onEditMember,
  onDeleteMember,
  onAddMembers,
  isAdmin,
  meetupOn,
  meetups,
  meetupState,
  meetupBusy,
  onOpenMeetup,
  onCloseMeetup,
  onSaveMeetup,
  onDeleteMeetup,
  today,
  onLoadSample,
  onResetData,
}: Props) {
  const empty = roster.length === 0;
  const allAttending = attendCount === roster.length;
  const tierCounts = TIERS.map((t) => [...tiers.values()].filter((v) => v === t).length);
  const absent = roster.filter((m) => !attend[m.id]).sort(byScore);

  const [calOpen, setCalOpen] = useState(false);
  const savedDates = new Set(meetups.map((m) => m.metOn));
  /** In 정모 mode on a date that has never been saved — 저장 will create it. */
  const unsavedMeetup = meetupOn !== null && !savedDates.has(meetupOn);
  /** Turning the switch on opens the newest saved 정모, or starts today's. */
  const onOpenLatestMeetup = () => onOpenMeetup(meetups[0]?.metOn ?? today);

  if (empty) {
    return (
      <div className="screen">
        <div className="eyebrow">{todayLabel()} · 정기모임</div>
        <div className="title">참석 명단</div>

        <div className="blank">
          <div className="blank__title">아직 멤버가 없어요</div>
          <div className="blank__sub">
            이름과 점수를 등록하면 점수 순위대로
            <br />
            1·2·3티어가 자동으로 나뉘어 배정됩니다.
          </div>
          <button type="button" className="blank__cta" onClick={onAddMembers}>
            멤버 등록하기
          </button>
          <button type="button" className="blank__ghost" onClick={onLoadSample}>
            예시 명단 30명으로 먼저 둘러보기
          </button>
          {/*
            빈 명단에서도 저장된 정모는 열 수 있어야 한다 — 처음 들어온 사람이
            보고 싶은 건 자기 이름이 아니라 운영자가 올려둔 그날의 레인이다.
          */}
          {meetups.length > 0 && (
            <button
              type="button"
              className="blank__ghost"
              onClick={onOpenLatestMeetup}
              disabled={meetupBusy}
            >
              저장된 정모 보기 ({meetups[0]!.metOn})
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderRow = (m: Member, tier: Tier | null) => (
    <div className="memberRow" key={m.id}>
      <button
        type="button"
        className="memberRow__main"
        style={{ opacity: editMode || tier !== null ? 1 : 0.42 }}
        onClick={() => (editMode ? onEditMember(m) : onToggleAttend(m.id))}
        aria-pressed={editMode ? undefined : tier !== null}
        aria-label={editMode ? `${m.name} 수정` : `${m.name} 참석 여부`}
      >
        <div
          className="check"
          style={{
            background: tier === null ? 'transparent' : TIER_COLOR[tier],
            borderColor: tier === null ? 'rgba(0,0,0,.2)' : TIER_COLOR[tier],
          }}
        >
          {tier === null ? '' : '✓'}
        </div>
        <div className="memberRow__name">{m.name}</div>
        <div className="memberRow__gender">{m.gender}</div>
        <div className="memberRow__avg">{m.avg}</div>
        {editMode && <div className="memberRow__edit">수정</div>}
      </button>
      {editMode && (
        <button
          type="button"
          className="memberRow__del"
          onClick={() => onDeleteMember(m)}
          aria-label={`${m.name} 삭제`}
          title={`${m.name} 삭제`}
        >
          ×
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="screen">
        <div className="rosterHead">
          <div className="rosterHead__left">
            <div className="eyebrow">
              {meetupOn ? `${meetupOn} · 저장된 정모` : `${todayLabel()} · 정기모임`}
            </div>
            <div className="rosterHead__titleRow">
              <div className="rosterHead__title">{meetupOn ? '정모 명단' : '참석 명단'}</div>
              <button
                type="button"
                className={`editToggle${editMode ? ' editToggle--on' : ''}`}
                onClick={onToggleEditMode}
                aria-pressed={editMode}
              >
                {editMode ? '완료' : '수정·삭제'}
              </button>
              {/*
                정모 스위치 — 이 브라우저에만 있는 세션 명단과, 저장해서 모두가
                보는 정모 명단을 오간다. 켜는 즉시 서버에 쓰이는 건 아니고,
                저장을 눌러야 올라간다.
              */}
              <button
                type="button"
                className={`meetupToggle${meetupOn ? ' meetupToggle--on' : ''}`}
                onClick={() => (meetupOn ? onCloseMeetup() : onOpenLatestMeetup())}
                disabled={meetupBusy || (!meetupOn && meetups.length === 0 && !isAdmin)}
                aria-pressed={meetupOn !== null}
                title={
                  meetupOn
                    ? '세션 명단으로 돌아가기'
                    : meetups.length === 0
                      ? '저장된 정모가 없어요'
                      : '저장된 정모 명단 보기'
                }
              >
                <span className="meetupToggle__dot" />
                정모
              </button>
            </div>
          </div>
          <div className="count">
            <div className="count__n">{attendCount}</div>
            <div className="count__d">/ {roster.length}명</div>
          </div>
        </div>

        {meetupOn !== null && (
          <div className="meetupBar">
            {/*
              날짜 하나와 캘린더 버튼. 정모마다 칩을 하나씩 붙이면 정모가
              쌓이는 만큼 줄이 늘어나므로, 어떤 날에 정모가 있는지는 캘린더
              안에서 검게 표시한다.
            */}
            <div className="meetupBar__dates">
              <span className={`chip${unsavedMeetup ? '' : ' chip--on'}`}>
                {meetupOn.slice(5).replace('-', '/')}
                {unsavedMeetup ? ' · 새 정모' : ` (${weekdayLabel(parseDate(meetupOn)!)})`}
              </span>
              <button
                type="button"
                className={`meetupBar__cal${calOpen ? ' meetupBar__cal--on' : ''}`}
                onClick={() => setCalOpen((v) => !v)}
                aria-expanded={calOpen}
                aria-label="정모 날짜 고르기"
                title="정모 날짜 고르기"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <rect x="1.5" y="3" width="13" height="11.5" rx="2" />
                  <path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" />
                </svg>
              </button>
            </div>

            {calOpen && (
              <MeetupCalendar
                savedDates={savedDates}
                selected={meetupOn}
                today={today}
                canPickNew={isAdmin}
                busy={meetupBusy}
                onPick={(metOn) => {
                  setCalOpen(false);
                  onOpenMeetup(metOn);
                }}
              />
            )}
            {/* 날짜 목록이 비어 있는 이유를 밝혀둔다 — 서버 문제와 정모 없음은 다르다. */}
            {meetupState === 'offline' && (
              <div className="meetupBar__note">
                서버에 연결하지 못해 저장된 정모를 불러오지 못했어요.
              </div>
            )}
            {meetupState === 'unconfigured' && (
              <div className="meetupBar__note">Supabase 설정이 없어 정모를 저장할 수 없어요.</div>
            )}
            {isAdmin ? (
              <div className="meetupBar__actions">
                <button
                  type="button"
                  className="meetupBar__save"
                  onClick={() => onSaveMeetup(meetupOn)}
                  disabled={meetupBusy}
                >
                  {meetupBusy ? '저장 중…' : '저장'}
                </button>
                {!unsavedMeetup && (
                  <button
                    type="button"
                    className="meetupBar__ghost meetupBar__ghost--del"
                    onClick={() => onDeleteMeetup(meetupOn)}
                    disabled={meetupBusy}
                  >
                    삭제
                  </button>
                )}
              </div>
            ) : (
              <div className="meetupBar__note">
                운영자가 저장한 명단입니다. 여기서 바꿔도 저장되지 않아요.
              </div>
            )}
          </div>
        )}

        <div className="rosterTools">
          <button type="button" className="addMemberBtn" onClick={onAddMembers}>
            <span className="addMemberBtn__plus">+</span> 멤버 추가
          </button>
          <button
            type="button"
            className="rosterTools__toggle"
            onClick={() => onSetAllAttend(!allAttending)}
          >
            {allAttending ? '전체 해제' : '전체 선택'}
          </button>
        </div>

        <div className="statRow">
          <div className="stat">
            <div className="stat__k">배정 레인</div>
            {/* 시작 레인이 1이면 개수만 — 3부터면 실제 번호대(3~10레인)를 보여준다. */}
            <div className="stat__v">
              {laneCount === 0 || firstLane === 1
                ? `${laneCount}레인`
                : `${firstLane}~${firstLane + laneCount - 1}레인`}
            </div>
          </div>
          <div className="stat">
            <div className="stat__k">티어 구성</div>
            <div className="stat__v">{tierCounts.join(' / ')}</div>
          </div>
        </div>

        {attendCount > 0 && (
          <div className="lanePlan">
            {/*
              레인 수와 시작 레인이 한 줄. 시작 레인은 볼링장에서 받은 번호대를
              그대로 쓰기 위한 값으로, 배정은 건드리지 않고 레인 번호만 옮긴다
              — 뽑기 도중에 바꿔도 사람이 다시 섞이지 않는다.
            */}
            <div className="lanePlan__head">
              <span className="lanePlan__label">레인 설정</span>
              <div className="lanePlan__fields">
                <div className="lanePlan__field">
                  <span className="lanePlan__fieldK">수</span>
                  <div className="lanePlan__stepper">
                    <button
                      type="button"
                      className="lanePlan__btn"
                      onClick={() => onChangeLaneCount(Math.max(minLaneCount, laneCount - 1))}
                      disabled={laneCount <= minLaneCount}
                      aria-label="레인 줄이기"
                    >
                      −
                    </button>
                    <span className="lanePlan__value">{laneCount}</span>
                    <button
                      type="button"
                      className="lanePlan__btn"
                      onClick={() => onChangeLaneCount(Math.min(attendCount, laneCount + 1))}
                      disabled={laneCount >= attendCount}
                      aria-label="레인 늘리기"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="lanePlan__field">
                  <span className="lanePlan__fieldK">시작</span>
                  <div className="lanePlan__stepper">
                    <button
                      type="button"
                      className="lanePlan__btn"
                      onClick={() => onChangeFirstLane(Math.max(1, firstLane - 1))}
                      disabled={firstLane <= 1}
                      aria-label="시작 레인 낮추기"
                    >
                      −
                    </button>
                    <span className="lanePlan__value">{firstLane}</span>
                    <button
                      type="button"
                      className="lanePlan__btn"
                      onClick={() =>
                        onChangeFirstLane(Math.min(MAX_LANE_NO - laneCount + 1, firstLane + 1))
                      }
                      disabled={firstLane >= MAX_LANE_NO - laneCount + 1}
                      aria-label="시작 레인 올리기"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lanePlan__sizes">
              {laneSizes.map((size, i) => (
                <span
                  key={i}
                  className={`lanePlan__lane${i % 2 === 1 ? ' lanePlan__lane--pair' : ''}`}
                  title={`${firstLane + i}번 레인 ${size}명`}
                >
                  <em className="lanePlan__laneNo">{firstLane + i}</em>
                  {size}
                </span>
              ))}
            </div>
            <div className="lanePlan__note">
              {firstLane}~{firstLane + laneSizes.length - 1}번 레인 · 레인당 최대 3명 · 2레인이 한
              테이블
              {laneSizes.length % 2 === 1 && ' · 마지막 테이블은 1레인'}
              {/* 되돌리기는 되돌릴 게 있을 때만 — 설정 줄이 두 줄로 늘어나지 않게 여기에 둔다. */}
              {laneCountChosen && laneCount !== autoLaneCount && (
                <button
                  type="button"
                  className="lanePlan__reset"
                  onClick={() => onChangeLaneCount(null)}
                >
                  자동 {autoLaneCount}레인
                </button>
              )}
              {firstLane !== 1 && (
                <button
                  type="button"
                  className="lanePlan__reset"
                  onClick={() => onChangeFirstLane(1)}
                >
                  1번부터
                </button>
              )}
            </div>
          </div>
        )}

        <div className="chips">
          {OPTION_LABELS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`chip${opts[key] ? ' chip--on' : ''}`}
              onClick={() => onToggleOption(key)}
              aria-pressed={opts[key]}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="tierGroups">
        {TIERS.map((tier) => {
          const members = roster
            .filter((m) => tiers.get(m.id) === tier)
            .sort(byScore);
          if (members.length === 0) return null;
          return (
            <div className="tierGroup" key={tier}>
              <div className="tierGroup__head">
                <div className="tierDot" style={{ background: TIER_COLOR[tier] }} />
                <div className="tierGroup__label">{tier}티어</div>
                <div className="tierGroup__count">{members.length}명</div>
              </div>
              <div className="card">{members.map((m) => renderRow(m, tier))}</div>
            </div>
          );
        })}

        {absent.length > 0 && (
          <div className="tierGroup">
            <div className="tierGroup__head">
              <div className="tierDot" style={{ background: '#C2C6CC' }} />
              <div className="tierGroup__label">미참석</div>
              <div className="tierGroup__count">{absent.length}명</div>
            </div>
            <div className="card">{absent.map((m) => renderRow(m, null))}</div>
          </div>
        )}

        {editMode && (
          <button type="button" className="resetData" onClick={onResetData}>
            명단 {roster.length}명 · 기록 전체 삭제
          </button>
        )}
      </div>
    </>
  );
}
