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
  opts: Options;
  attendCount: number;
  laneCount: number;
  editMode: boolean;
  onToggleEditMode: () => void;
  onToggleAttend: (id: string) => void;
  onToggleOption: (key: keyof Options) => void;
  onEditMember: (member: Member) => void;
  onDeleteMember: (member: Member) => void;
  onAddMember: (tier: Tier) => void;
  onLoadSample: () => void;
  onResetData: () => void;
}

export function RosterScreen({
  roster,
  attend,
  opts,
  attendCount,
  laneCount,
  editMode,
  onToggleEditMode,
  onToggleAttend,
  onToggleOption,
  onEditMember,
  onDeleteMember,
  onAddMember,
  onLoadSample,
  onResetData,
}: Props) {
  const tierCounts = TIERS.map((t) => roster.filter((m) => m.tier === t && attend[m.id]).length);
  const uneven = new Set(tierCounts.filter((c) => c > 0)).size > 1;
  const empty = roster.length === 0;

  if (empty) {
    return (
      <div className="screen">
        <div className="eyebrow">{todayLabel()} · 정기모임</div>
        <div className="title">참석 명단</div>

        <div className="blank">
          <div className="blank__title">아직 멤버가 없어요</div>
          <div className="blank__sub">
            이름과 에버리지를 등록하면
            <br />
            티어별로 균형 잡힌 레인을 배정해 드려요.
          </div>
          <button type="button" className="blank__cta" onClick={() => onAddMember(1)}>
            첫 멤버 추가하기
          </button>
          <button type="button" className="blank__ghost" onClick={onLoadSample}>
            예시 명단 30명으로 먼저 둘러보기
          </button>
        </div>
      </div>
    );
  }

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

        <button type="button" className="addMemberBtn" onClick={() => onAddMember(1)}>
          <span className="addMemberBtn__plus">+</span> 멤버 추가
        </button>

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

        {uneven && (
          <div className="notice">
            티어별 인원이 달라요. 인원이 적은 티어 때문에 뒤쪽 레인은 2~3인으로 배정됩니다.
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
          const members = roster.filter((m) => m.tier === tier);
          const present = members.filter((m) => attend[m.id]).length;
          return (
            <div className="tierGroup" key={tier}>
              <div className="tierGroup__head">
                <div className="tierDot" style={{ background: TIER_COLOR[tier] }} />
                <div className="tierGroup__label">{tier}티어</div>
                <div className="tierGroup__count">
                  {present} / {members.length}
                </div>
              </div>
              <div className="card">
                {members.map((m) => {
                  const on = attend[m.id] ?? false;
                  return (
                    <div className="memberRow" key={m.id}>
                      {/* Edit mode swaps the row's job: attendance toggle -> open editor. */}
                      <button
                        type="button"
                        className="memberRow__main"
                        style={{ opacity: editMode || on ? 1 : 0.42 }}
                        onClick={() => (editMode ? onEditMember(m) : onToggleAttend(m.id))}
                        aria-pressed={editMode ? undefined : on}
                        aria-label={editMode ? `${m.name} 수정` : `${m.name} 참석 여부`}
                      >
                        <div
                          className="check"
                          style={{
                            background: on ? TIER_COLOR[tier] : 'transparent',
                            borderColor: on ? TIER_COLOR[tier] : 'rgba(0,0,0,.2)',
                          }}
                        >
                          {on ? '✓' : ''}
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
                })}
                <button type="button" className="addRow" onClick={() => onAddMember(tier)}>
                  <div className="addRow__plus">+</div>
                  <div>{tier}티어에 멤버 추가</div>
                </button>
              </div>
            </div>
          );
        })}

        {editMode && (
          <button type="button" className="resetData" onClick={onResetData}>
            명단·기록 전체를 초기 상태로 되돌리기
          </button>
        )}
      </div>
    </>
  );
}
