import type { GameLanes } from '../lib/format';
import { namesLine, todayShort } from '../lib/format';

interface Props {
  /** One game from the result screen, or every recorded game from 기록. */
  games: readonly GameLanes[];
  onClose: () => void;
  onShare: () => void;
  onCopy: () => void;
  /** Copies the lane card as a PNG, falling back to share/download. */
  onCopyImage: () => void;
}

export function ShareSheet({ games, onClose, onShare, onCopy, onCopyImage }: Props) {
  const multi = games.length > 1;
  const title = multi ? '레인 배정 기록' : `GAME ${games[0]?.game ?? 1} 레인 배정`;

  return (
    <div
      className="shareScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 공유`}
    >
      <div className="shareCard" onClick={(e) => e.stopPropagation()}>
        <div className="shareCard__head">
          <div className="shareCard__title">{title}</div>
          <div className="shareCard__meta">
            {todayShort()} 정기모임{multi && ` · ${games.length}게임`}
          </div>
        </div>

        {games.map(({ game, lanes }) => (
          <div key={game}>
            {/* 여러 게임일 때만 게임 머리 — 한 게임이면 위 제목과 겹친다. */}
            {multi && <div className="shareCard__game">GAME {game}</div>}
            <div className="shareGrid">
              {lanes.map((lane) => (
                <div className="shareLane" key={lane.no}>
                  <div className="shareLane__no">LANE {lane.no}</div>
                  <div className="shareLane__names">{namesLine(lane)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="shareActions">
          <button type="button" className="shareActions__primary" onClick={onShare}>
            공유하기
          </button>
          {/*
            이미지 복사는 클릭 제스처 안에서 클립보드에 써야 Safari 가 허용한다
            — 그래서 시트를 닫지 않고 여기서 바로 처리한다.
          */}
          <button type="button" className="shareActions__secondary" onClick={onCopyImage}>
            이미지 복사
          </button>
          <button type="button" className="shareActions__secondary" onClick={onCopy}>
            텍스트 복사
          </button>
        </div>
      </div>
    </div>
  );
}
