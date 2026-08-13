import type { HistoryEntry, Lane, Options, ResultView } from '../types';
import { TIER_COLOR } from '../theme';
import { laneAvgDeviation, repeatPairCount } from '../lib/assign';

interface Props {
  game: number;
  lanes: readonly Lane[];
  opts: Options;
  /** Games *before* this one — what 중복 방지 was scored against. */
  priorHistory: readonly HistoryEntry[];
  view: ResultView;
  onChangeView: (view: ResultView) => void;
  onShare: () => void;
}

export function ResultScreen({
  game,
  lanes,
  opts,
  priorHistory,
  view,
  onChangeView,
  onShare,
}: Props) {
  const memberCount = lanes.reduce((s, l) => s + l.members.length, 0);
  const deviation = lanes.length > 0 ? laneAvgDeviation(lanes).toFixed(1) : '0';
  const board = view === 'board';

  return (
    <div className="screen">
      <div className="resultHead">
        <div className="resultHead__left">
          <div className="resultHead__eyebrow">
            GAME {game} · {memberCount}명{board ? '' : ` ${lanes.length}레인`}
          </div>
          <div className="resultHead__title">{board ? 'LANE BOARD' : '배정 완료'}</div>
        </div>
        <div className="resultHead__right">
          <div className="seg" role="group" aria-label="결과 보기 방식">
            {(
              [
                ['cards', '카드'],
                ['board', '보드'],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={`seg__btn${view === key ? ' seg__btn--on' : ''}`}
                aria-pressed={view === key}
                onClick={() => onChangeView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="shareBtn" onClick={onShare}>
            공유
          </button>
        </div>
      </div>

      {board ? <LaneBoard lanes={lanes} priorHistory={priorHistory} /> : null}

      {!board && (
        <>
          <div className="badges">
            <div className="badge">평균 편차 ±{deviation}</div>
            <div className="badge">{opts.avoid ? '이전 회차 중복 회피' : '중복 허용'}</div>
            <div className="badge">{opts.gender ? '성별 고르게 분배' : '성별 미고려'}</div>
          </div>

          <div className="resultLanes">
            {lanes.map((lane, i) => (
              <div
                className="resultLane"
                key={lane.no}
                style={{ animationDelay: `${Math.min(i, 9) * 0.04}s` }}
              >
                <div className="resultLane__row">
                  <div className="resultLane__no">{lane.no}</div>
                  <div className="resultLane__members">
                    {lane.members.map((m) => (
                      <div className="memTile" key={m.id}>
                        <div className="memTile__top">
                          <div
                            className="memTile__dot"
                            style={{ background: TIER_COLOR[m.tier] }}
                          />
                          <div className="memTile__tier">T{m.tier}</div>
                        </div>
                        <div className="memTile__name">{m.name}</div>
                        <div className="memTile__avg">{m.avg}</div>
                      </div>
                    ))}
                  </div>
                  <div className="resultLane__avg">
                    <div className="resultLane__avgK">AVG</div>
                    <div className="resultLane__avgV">{lane.avg}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Design 1b — lanes as horizontal strips on a dark board. */
function LaneBoard({
  lanes,
  priorHistory,
}: {
  lanes: readonly Lane[];
  priorHistory: readonly HistoryEntry[];
}) {
  const deviation = lanes.length > 0 ? laneAvgDeviation(lanes).toFixed(1) : '0';
  const repeats = repeatPairCount(lanes, priorHistory);
  const femaleCount = lanes.reduce(
    (s, l) => s + l.members.filter((m) => m.gender === '여').length,
    0,
  );

  return (
    <>
      <div className="laneStrips">
        {lanes.map((lane, i) => (
          <div
            className="laneStrip"
            key={lane.no}
            style={{ animationDelay: `${Math.min(i, 9) * 0.04}s` }}
          >
            <div className="laneStrip__no">
              <div className="laneStrip__noN">{lane.no}</div>
              <div className="laneStrip__noK">LANE</div>
            </div>
            <div className="laneStrip__members">
              {lane.members.map((m) => (
                <div className="laneStrip__cell" key={m.id}>
                  <div className="laneStrip__tier" style={{ color: TIER_COLOR[m.tier] }}>
                    TIER {m.tier}
                  </div>
                  <div className="laneStrip__name">{m.name}</div>
                </div>
              ))}
            </div>
            <div className="laneStrip__avg">
              <div className="laneStrip__avgK">AVG</div>
              <div className="laneStrip__avgV">{lane.avg}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="boardFoot">
        <div>레인 평균 편차 ±{deviation}</div>
        <div>
          중복 팀 {repeats}쌍 · 여성 {femaleCount}명
        </div>
      </div>
    </>
  );
}
