import type { LeaguePlayer } from '../../league/types';
import { teamScore } from '../../league/tiers';

interface Props {
  roster: readonly LeaguePlayer[];
  /** 대진 핸디캡 for this side; 0 when the fixture is even or it is the stronger team. */
  fixtureHandicap: number;
}

/**
 * The team's adjustment for a fixture, in one line: handicaps added, penalties
 * taken off, and the fixture handicap that closes a 점수 gap.
 *
 * Individual figures sit next to each name; this is the total that actually
 * moves the score, which is otherwise only visible after the game is recorded.
 */
export function TeamAdjust({ roster, fixtureHandicap }: Props) {
  const { handicap, penalty } = teamScore(roster);
  const net = handicap + fixtureHandicap - penalty;
  if (handicap === 0 && penalty === 0 && fixtureHandicap === 0) return null;

  return (
    <div className="teamAdjust" title="게임마다 팀 점수에 적용되는 값">
      <span className="teamAdjust__h">핸디 +{handicap}</span>
      {penalty > 0 && <span className="teamAdjust__p">(− 팀 패널티 {penalty})</span>}
      {fixtureHandicap > 0 && (
        <span className="teamAdjust__f">대진 +{fixtureHandicap}</span>
      )}
      <span className="teamAdjust__net">
        게임당 {net >= 0 ? `+${net}` : net}
      </span>
    </div>
  );
}
