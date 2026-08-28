import type { LeagueSnapshot } from '../../league/api';
import type { LoadState } from '../../league/useLeague';
import type { LeaguePlayer } from '../../league/types';
import {
  groupByTier,
  scoreBreakdown,
  TIER_META,
  TIER_ORDER,
  type TieredPlayer,
} from '../../league/tiers';

interface Props {
  snapshot: LeagueSnapshot;
  state: LoadState;
  error: string | null;
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (player: LeaguePlayer) => void;
  onRetry: () => void;
}

export function PlayersTab({ snapshot, state, error, isAdmin, onAdd, onEdit, onRetry }: Props) {
  const { players } = snapshot;
  const { tiers, unranked } = groupByTier(players);
  const ranked = players.length - unranked.length;

  const row = (p: TieredPlayer) => (
    <div className="memberRow" key={p.id}>
      <button
        type="button"
        className="memberRow__main"
        onClick={() => isAdmin && onEdit(p)}
        disabled={!isAdmin}
        aria-label={isAdmin ? `${p.name} 수정` : p.name}
      >
        <div className="memberRow__name">{p.name}</div>
        <div className="memberRow__gender">{p.gender ?? '—'}</div>
        <ScoreCell player={p} />
        {isAdmin && <div className="memberRow__edit">수정</div>}
      </button>
    </div>
  );

  return (
    <div className="screen">
      <div className="eyebrow">상주리그</div>
      <div className="rosterHead">
        <div className="rosterHead__left">
          <div className="rosterHead__titleRow">
            <div className="rosterHead__title">선수 명단</div>
          </div>
        </div>
        <div className="count">
          <div className="count__n">{players.length}</div>
          <div className="count__d">명</div>
        </div>
      </div>

      {state === 'loading' && players.length === 0 && (
        <div className="notice notice--calm">불러오는 중…</div>
      )}

      {state === 'offline' && (
        <div className="notice">
          서버에 연결하지 못했어요. 마지막으로 받은 명단을 보여주는 중입니다.
          {error && <div className="notice__detail">{error}</div>}
          <button type="button" className="notice__action" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      {state === 'unconfigured' && (
        <div className="notice">Supabase 설정이 없어 리그 데이터를 불러올 수 없습니다.</div>
      )}

      {isAdmin && (
        <div className="rosterTools">
          <button type="button" className="addMemberBtn" onClick={onAdd}>
            <span className="addMemberBtn__plus">+</span> 선수 등록
          </button>
        </div>
      )}

      {ranked > 0 && (
        <>
          <div className="statRow">
            {TIER_ORDER.map((t) => (
              <div className="stat" key={t}>
                <div className="stat__k" style={{ color: TIER_META[t].color }}>
                  {TIER_META[t].label}
                </div>
                <div className="stat__v">{tiers[t].length}명</div>
              </div>
            ))}
          </div>
          <div className="hintBox hintBox--tight">
            핸디 포함 점수 순으로 상위 30% 골드 · 40% 실버 · 30% 브론즈
          </div>
        </>
      )}

      {players.length === 0 && state !== 'loading' ? (
        <div className="blank">
          <div className="blank__title">등록된 선수가 없어요</div>
          <div className="blank__sub">
            {isAdmin
              ? '선수를 등록하면 핸디 포함 점수로 티어가 자동으로 나뉩니다.'
              : '운영자가 선수를 등록하면 여기에 표시됩니다.'}
          </div>
          {isAdmin && (
            <button type="button" className="blank__cta" onClick={onAdd}>
              선수 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="tierSections">
          {TIER_ORDER.map((t) => {
            const group = tiers[t];
            if (group.length === 0) return null;
            const top = group[0]?.effective;
            const bottom = group[group.length - 1]?.effective;
            return (
              <div className="tierSection" key={t}>
                <div className="tierGroup__head">
                  <div className="tierDot" style={{ background: TIER_META[t].color }} />
                  <div className="tierGroup__label">{TIER_META[t].label}</div>
                  <div className="tierGroup__count">{group.length}명</div>
                  <div className="tierSection__range">
                    {bottom === top ? top : `${bottom} ~ ${top}`}
                  </div>
                </div>
                <div className="card">{group.map(row)}</div>
              </div>
            );
          })}

          {unranked.length > 0 && (
            <div className="tierSection">
              <div className="tierGroup__head">
                <div className="tierDot" style={{ background: '#C2C6CC' }} />
                <div className="tierGroup__label">점수 미기입</div>
                <div className="tierGroup__count">{unranked.length}명</div>
              </div>
              <div className="card">{unranked.map(row)}</div>
              <div className="hintBox hintBox--tight">점수를 넣으면 티어에 포함됩니다.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Shows the tier basis with its working: `176 (164 +12)`. The parenthetical is
 * dropped when nothing adjusts the score, so an unadjusted player reads as a
 * plain number rather than `164 (164)`.
 */
function ScoreCell({ player }: { player: TieredPlayer }) {
  const parts = scoreBreakdown(player);

  // Both columns are always rendered, empty if unused, so the numbers and the
  // opening parenthesis line up down the list regardless of who has an
  // adjustment.
  return (
    <div className="scoreCell" title="핸디 포함 점수 (원점수 조정)">
      <span className={`scoreCell__eff${parts === null ? ' scoreCell__eff--none' : ''}`}>
        {parts === null ? '–' : parts.effective}
      </span>
      <span className="scoreCell__parts">
        {parts !== null && parts.adjustments.length > 0 && (
          <>
            ({parts.base}
            {parts.adjustments.map((a) => (
              <em
                key={a}
                className={`scoreCell__adj${a.startsWith('−') ? ' scoreCell__adj--pen' : ''}`}
              >
                {a}
              </em>
            ))}
            )
          </>
        )}
      </span>
    </div>
  );
}
