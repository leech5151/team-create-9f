import type { LeaguePlayer } from '../../league/types';
import { teamScore } from '../../league/tiers';

interface Props {
  roster: readonly LeaguePlayer[];
}

/**
 * The line-up's raw 점수 total.
 *
 * The handicap and penalty are deliberately not folded in — `TeamAdjust`
 * prints those directly below, so this stays the scratch number only.
 *
 * A member with no 점수 recorded contributes nothing but still counts toward
 * the size, so the shortfall is named rather than left as a silently low total.
 */
export function TotalLine({ roster }: Props) {
  const score = teamScore(roster);
  const partial = score.scored < score.size;

  return (
    <div className="totalLine" title="팀 원점수 합계">
      <span className="totalLine__base">{score.scored === 0 ? '–' : score.base}</span>
      {partial && score.scored > 0 && (
        <span className="totalLine__warn">{score.size - score.scored}명 점수 없음</span>
      )}
    </div>
  );
}
