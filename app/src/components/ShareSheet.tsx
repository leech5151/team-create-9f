import type { Lane } from '../types';
import { namesLine, todayShort } from '../lib/format';

interface Props {
  game: number;
  lanes: readonly Lane[];
  onClose: () => void;
  onShare: () => void;
  onCopy: () => void;
  /** Copies the lane card as a PNG, falling back to share/download. */
  onCopyImage: () => void;
}

export function ShareSheet({ game, lanes, onClose, onShare, onCopy, onCopyImage }: Props) {
  return (
    <div
      className="shareScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`GAME ${game} 레인 배정 공유`}
    >
      <div className="shareCard" onClick={(e) => e.stopPropagation()}>
        <div className="shareCard__head">
          <div className="shareCard__title">GAME {game} 레인 배정</div>
          <div className="shareCard__meta">{todayShort()} 정기모임</div>
        </div>
        <div className="shareGrid">
          {lanes.map((lane) => (
            <div className="shareLane" key={lane.no}>
              <div className="shareLane__no">LANE {lane.no}</div>
              <div className="shareLane__names">{namesLine(lane)}</div>
            </div>
          ))}
        </div>
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
