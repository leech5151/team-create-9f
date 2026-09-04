import { TIER_META, type TieredPlayer } from '../../league/tiers';

interface Props {
  player: TieredPlayer;
}

/**
 * One name on a fixture line-up: tier dot, name, 점수, then the adjustments
 * that move it — `+핸디` and `−패널티`.
 *
 * 점수 is the raw figure, kept neutral so the coloured adjustments beside it
 * stay the thing that stands out. A player with no 점수 recorded shows a dash
 * rather than nothing, which is what makes the gap in the team total legible.
 */
export function FixturePlayer({ player }: Props) {
  return (
    <span className="fixture__player">
      {player.tier && (
        <em className="fixture__tier" style={{ background: TIER_META[player.tier].color }} />
      )}
      {player.name}
      <em className="fixture__score">{player.avg ?? '–'}</em>
      {player.handicap > 0 && <em className="fixture__adj">+{player.handicap}</em>}
      {player.penalty > 0 && <em className="fixture__adj fixture__adj--pen">−{player.penalty}</em>}
    </span>
  );
}
