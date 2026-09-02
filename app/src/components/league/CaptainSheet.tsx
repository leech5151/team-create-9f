import type { LeaguePlayer } from '../../league/types';

interface Props {
  teamName: string;
  candidates: readonly LeaguePlayer[];
  /** Currently chosen captain for this team, if any. */
  selectedId: string | null;
  /** playerId → team name, for players already captaining another team. */
  takenBy: ReadonlyMap<string, string>;
  onPick: (playerId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Picks one captain for a team. Players leading another team are shown as taken. */
export function CaptainSheet({
  teamName,
  candidates,
  selectedId,
  takenBy,
  onPick,
  onClear,
  onClose,
}: Props) {
  return (
    <div
      className="sheetScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${teamName} 팀장 지정`}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{teamName} 팀장</div>
        <div className="sheet__hint">한 선수는 한 팀의 팀장만 맡을 수 있어요.</div>

        <div className="card captainPickList">
          {candidates.map((p) => {
            const taken = takenBy.get(p.id);
            const mine = selectedId === p.id;
            return (
              <div className="memberRow" key={p.id}>
                <button
                  type="button"
                  className="memberRow__main"
                  disabled={taken !== undefined && !mine}
                  style={{ opacity: taken !== undefined && !mine ? 0.4 : 1 }}
                  onClick={() => onPick(p.id)}
                  aria-pressed={mine}
                >
                  <div
                    className="check"
                    style={{
                      background: mine ? '#FF4A21' : 'transparent',
                      borderColor: mine ? '#FF4A21' : 'rgba(0,0,0,.2)',
                    }}
                  >
                    {mine ? '✓' : ''}
                  </div>
                  <div className="memberRow__name">{p.name}</div>
                  <div className="memberRow__gender">{p.gender ?? '—'}</div>
                  <div className="memberRow__avg">{p.avg ?? '–'}</div>
                  {taken !== undefined && !mine && (
                    <div className="memberRow__edit">{taken}</div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={onClose}>
            확인
          </button>
          {selectedId && (
            <button type="button" className="sheet__ghost" onClick={onClear}>
              해제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
