import { useState } from 'react';
import type { GameLanes } from '../lib/format';
import { TIER_COLOR } from '../theme';

interface Props {
  /** Every recorded game, oldest first, with lanes already hydrated. */
  games: readonly GameLanes[];
  /** Opens the share popup for these games — text and image live in there. */
  onShare: (games: readonly GameLanes[]) => void;
}

/**
 * 기록 — every game drawn so far.
 *
 * A card opens into the full result for that game. Starting the next game used
 * to put the previous one out of reach: the result screen only ever shows the
 * draw in progress, so once it was replaced the earlier lanes could only be
 * read as a list of names. The same lane cards live here instead.
 */
export function HistoryScreen({ games, onShare }: Props) {
  /** Which game is expanded to its result, if any. */
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="screen">
      <div className="histHead">
        <div>
          <div className="title" style={{ marginTop: 0 }}>
            기록
          </div>
          <div className="histSub">최근 배정은 다음 추첨의 중복 방지에 반영돼요.</div>
        </div>
        {games.length > 0 && (
          <div className="histHead__actions">
            <button
              type="button"
              className="histBtn histBtn--strong"
              onClick={() => onShare(games)}
            >
              전체 공유
            </button>
          </div>
        )}
      </div>

      {games.length === 0 ? (
        <div className="empty">
          아직 기록이 없어요.
          <br />
          배정을 완료하면 여기에 쌓입니다.
        </div>
      ) : (
        <div className="histList">
          {games.map((entry) => {
            const expanded = open === entry.game;
            const heads = entry.lanes.reduce((n, l) => n + l.members.length, 0);
            return (
              <div className="histCard" key={entry.game}>
                <button
                  type="button"
                  className="histCard__head"
                  onClick={() => setOpen(expanded ? null : entry.game)}
                  aria-expanded={expanded}
                >
                  <div className="histCard__title">GAME {entry.game}</div>
                  <div className="histCard__meta">
                    {entry.lanes.length}레인 · {heads}명
                  </div>
                  <span className={`histCard__caret${expanded ? ' histCard__caret--on' : ''}`}>
                    ›
                  </span>
                </button>

                {expanded ? (
                  <>
                    {/* 결과 화면과 같은 레인 카드 — 이름·티어·레인 평균까지. */}
                    <div className="histResult">
                      {entry.lanes.map((lane) => (
                        <div className="histResult__lane" key={lane.no}>
                          <div className="histResult__no">{lane.no}</div>
                          <div className="histResult__members">
                            {lane.members.map((m) => (
                              <div className="memTile" key={m.id}>
                                <div className="memTile__top">
                                  <div
                                    className="memTile__dot"
                                    style={{ background: TIER_COLOR[m.tier] }}
                                  />
                                  <div className="memTile__tier">T{m.tier}</div>
                                </div>
                                <div className="memTile__name">{m.name}</div>
                                <div className="memTile__avg">{m.avg}</div>
                              </div>
                            ))}
                          </div>
                          <div className="histResult__avg">
                            <div className="histResult__avgK">AVG</div>
                            <div className="histResult__avgV">{lane.avg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="histCard__actions">
                      <button
                        type="button"
                        className="histBtn histBtn--strong"
                        onClick={() => onShare([entry])}
                      >
                        이 게임 공유
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="histLanes">
                    {entry.lanes.map((lane) => (
                      <div className="histLane" key={lane.no}>
                        <span className="histLane__no">{lane.no}</span>{' '}
                        {lane.members.map((m) => m.name).join(' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
