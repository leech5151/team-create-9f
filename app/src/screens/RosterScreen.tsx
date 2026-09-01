import type { Member, Options, Tier } from '../types';
import { TIERS } from '../types';
import { TIER_COLOR } from '../theme';
import { todayLabel } from '../lib/format';

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
  editMode,
  onToggleEditMode,
  onToggleAttend,
  onSetAllAttend,
  onToggleOption,
  onEditMember,
  onDeleteMember,
  onAddMembers,
  onLoadSample,
  onResetData,
}: Props) {
  const empty = roster.length === 0;
  const allAttending = attendCount === roster.length;
  const tierCounts = TIERS.map((t) => [...tiers.values()].filter((v) => v === t).length);
  const absent = roster.filter((m) => !attend[m.id]).sort(byScore);

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
            <div className="eyebrow">{todayLabel()} · 정기모임</div>
            <div className="rosterHead__titleRow">
              <div className="rosterHead__title">참석 명단</div>
              <button
                type="button"
                className={`editToggle${editMode ? ' editToggle--on' : ''}`}
                onClick={onToggleEditMode}
                aria-pressed={editMode}
              >
                {editMode ? '완료' : '수정·삭제'}
              </button>
            </div>
          </div>
          <div className="count">
            <div className="count__n">{attendCount}</div>
            <div className="count__d">/ {roster.length}명</div>
          </div>
        </div>

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
            <div className="stat__v">{laneCount}레인</div>
          </div>
          <div className="stat">
            <div className="stat__k">티어 구성</div>
            <div className="stat__v">{tierCounts.join(' / ')}</div>
          </div>
        </div>

        {attendCount > 0 && (
          <div className="lanePlan">
            <div className="lanePlan__head">
              <span className="lanePlan__label">레인 수</span>
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
              {laneCountChosen && laneCount !== autoLaneCount && (
                <button
                  type="button"
                  className="lanePlan__auto"
                  onClick={() => onChangeLaneCount(null)}
                >
                  자동({autoLaneCount})
                </button>
              )}
            </div>
            <div className="lanePlan__sizes">
              {laneSizes.map((size, i) => (
                <span
                  key={i}
                  className={`lanePlan__lane${i % 2 === 1 ? ' lanePlan__lane--pair' : ''}`}
                >
                  {size}
                </span>
              ))}
            </div>
            <div className="lanePlan__note">
              레인당 최대 3명 · 2레인이 한 테이블
              {laneSizes.length % 2 === 1 && ' · 마지막 테이블은 1레인'}
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
