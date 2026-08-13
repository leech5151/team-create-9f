import type { HistoryEntry, Member } from '../types';

interface Props {
  history: readonly HistoryEntry[];
  byId: ReadonlyMap<string, Member>;
}

export function HistoryScreen({ history, byId }: Props) {
  return (
    <div className="screen">
      <div className="title" style={{ marginTop: 0 }}>
        기록
      </div>
      <div className="histSub">최근 배정은 다음 추첨의 중복 방지에 반영돼요.</div>

      {history.length === 0 ? (
        <div className="empty">
          아직 기록이 없어요.
          <br />
          배정을 완료하면 여기에 쌓입니다.
        </div>
      ) : (
        <div className="histList">
          {history.map((entry) => {
            const names = entry.lanes.map((lane) =>
              lane
                .map((id) => byId.get(id)?.name)
                .filter((n): n is string => n !== undefined)
                .join(' '),
            );
            return (
              <div className="histCard" key={entry.game}>
                <div className="histCard__head">
                  <div className="histCard__title">GAME {entry.game}</div>
                  <div className="histCard__meta">
                    {entry.lanes.length}레인 · {entry.lanes.flat().length}명
                  </div>
                </div>
                <div className="histLanes">
                  {names.map((line, i) => (
                    <div className="histLane" key={i}>
                      <span className="histLane__no">{i + 1}</span> {line}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
