import type { LoadState } from '../../league/useLeague';
import {
  EXCHANGE_SIDES,
  handicapOf,
  teamName,
  type ExchangePlayer,
  type ExchangeSide,
  type ExchangeSnapshot,
} from '../../exchange/api';

interface Props {
  snapshot: ExchangeSnapshot;
  state: LoadState;
  error: string | null;
  isAdmin: boolean;
  side: ExchangeSide;
  onChangeSide: (side: ExchangeSide) => void;
  onAdd: () => void;
  onEdit: (player: ExchangePlayer) => void;
  onOpenSettings: () => void;
  onClearSide: () => void;
  onRetry: () => void;
}

/** Team average with each player's 여성 핸디 folded in. */
function teamAverage(players: readonly ExchangePlayer[], snapshot: ExchangeSnapshot) {
  if (players.length === 0) return null;
  const sum = players.reduce((acc, p) => acc + p.avg + handicapOf(p, snapshot.settings), 0);
  return Math.round(sum / players.length);
}

export function PlayersTab({
  snapshot,
  state,
  error,
  isAdmin,
  side,
  onChangeSide,
  onAdd,
  onEdit,
  onOpenSettings,
  onClearSide,
  onRetry,
}: Props) {
  const { settings } = snapshot;
  const bySide = (s: ExchangeSide) => snapshot.players.filter((p) => p.side === s);
  const players = bySide(side).sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
  const women = players.filter((p) => p.gender === '여').length;
  const average = teamAverage(players, snapshot);

  return (
    <div className="screen">
      <div className="eyebrow">교류전</div>
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

      {state === 'loading' && snapshot.players.length === 0 && (
        <div className="notice notice--calm">불러오는 중…</div>
      )}

      {state === 'offline' && (
        <div className="notice">
          서버에 연결하지 못했어요.
          {error && <div className="notice__detail">{error}</div>}
          <button type="button" className="notice__action" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      {state === 'unconfigured' && (
        <div className="notice">Supabase 설정이 없어 교류전 데이터를 불러올 수 없습니다.</div>
      )}

      {/* 1:1 — 두 팀 중 하나를 골라 그 명단을 본다. */}
      <div className="exchangeSides" role="tablist">
        {EXCHANGE_SIDES.map((s) => (
          <button
            type="button"
            key={s}
            role="tab"
            aria-selected={side === s}
            className={`exchangeSide${side === s ? ' exchangeSide--on' : ''}`}
            onClick={() => onChangeSide(s)}
          >
            <span className="exchangeSide__name">{teamName(s, settings)}</span>
            <span className="exchangeSide__count">{bySide(s).length}명</span>
          </button>
        ))}
      </div>

      <div className="statRow statRow--three">
        <div className="stat">
          <div className="stat__k">평균 (핸디 포함)</div>
          <div className="stat__v stat__v--num">{average ?? '–'}</div>
        </div>
        <div className="stat">
          <div className="stat__k">남 · 여</div>
          <div className="stat__v">
            {players.length - women} · {women}
          </div>
        </div>
        <div className="stat">
          <div className="stat__k">여성 핸디</div>
          <div className="stat__v">
            {settings.femaleHandicapOn ? `+${settings.femaleHandicap}` : '미적용'}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="rosterTools">
          <button type="button" className="addMemberBtn" onClick={onAdd}>
            <span className="addMemberBtn__plus">+</span> 선수 등록
          </button>
          <button type="button" className="rosterTools__toggle" onClick={onOpenSettings}>
            설정
          </button>
        </div>
      )}

      {players.length === 0 && state !== 'loading' ? (
        <div className="blank">
          <div className="blank__title">{teamName(side, settings)} 선수가 없어요</div>
          <div className="blank__sub">
            {isAdmin
              ? '선수 이름 · 성별 · 에버리지를 등록해 주세요.'
              : '운영자가 선수를 등록하면 여기에 표시됩니다.'}
          </div>
          {isAdmin && (
            <button type="button" className="blank__cta" onClick={onAdd}>
              선수 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="card exchangeRoster">
          {players.map((p) => {
            const handi = handicapOf(p, settings);
            return (
              <div className="memberRow" key={p.id}>
                <button
                  type="button"
                  className={`memberRow__main memberRow__main--exchange${
                    isAdmin ? ' memberRow__main--editable' : ''
                  }`}
                  onClick={() => isAdmin && onEdit(p)}
                  disabled={!isAdmin}
                  aria-label={isAdmin ? `${p.name} 수정` : p.name}
                >
                  <div className="memberRow__name">{p.name}</div>
                  <div className="memberRow__gender">{p.gender}</div>
                  <div className="scoreCell" title="에버리지 (핸디)">
                    <span className="scoreCell__eff">{p.avg}</span>
                    <span className="scoreCell__parts">
                      {handi > 0 && (
                        <>
                          (<em className="scoreCell__adj" style={{ marginLeft: 0 }}>+{handi}</em>)
                        </>
                      )}
                    </span>
                  </div>
                  {isAdmin && <div className="memberRow__edit">수정</div>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && players.length > 0 && (
        <button type="button" className="resetData exchangeClear" onClick={onClearSide}>
          {teamName(side, settings)} 명단 비우기
        </button>
      )}
    </div>
  );
}
