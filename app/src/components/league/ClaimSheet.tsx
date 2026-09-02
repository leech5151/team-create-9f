import type { Team } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';

interface Props {
  player: LeaguePlayer;
  teams: readonly { team: Team; members: readonly LeaguePlayer[]; captainId: string | null }[];
  busy: boolean;
  onClaim: (teamId: string) => void;
  onClose: () => void;
}

/** Picks which team claims the drawn player. */
export function ClaimSheet({ player, teams, busy, onClaim, onClose }: Props) {
  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="낙찰">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{player.name} 낙찰</div>
        <div className="sheet__hint">
          어느 팀이 데려갈지 고르세요.
          {player.avg !== null && ` 점수 ${player.avg}`}
          {player.handicap > 0 && ` · 핸디 +${player.handicap}`}
        </div>

        <div className="claimList">
          {teams.map(({ team, members, captainId }) => (
            <button
              type="button"
              key={team.id}
              className="claimRow"
              disabled={busy}
              onClick={() => onClaim(team.id)}
            >
              <span className="claimRow__body">
                <span className="claimRow__name">{team.name}</span>
                <span className="claimRow__members">
                  {members.length === 0
                    ? '미배정'
                    : members
                        .map((m) => (captainId === m.id ? `${m.name}(장)` : m.name))
                        .join(' · ')}
                </span>
              </span>
              <span className="claimRow__count">{members.length}명</span>
            </button>
          ))}
        </div>

        <div className="sheet__actions">
          <button type="button" className="sheet__ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
