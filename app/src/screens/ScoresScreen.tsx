import { useMemo, useState } from 'react';
import { RECENT_GAMES, avgLabel, type RegistryMember } from '../meetup/registry';
import {
  HIGH_AVG,
  ICON_PATHS,
  byScore,
  gamesLabel,
  rankOf,
  scored,
  type Rank,
} from '../meetup/ranks';
import { downloadScoreImage } from '../lib/scoreImage';
import type { LoadState } from '../league/useLeague';

interface Props {
  registry: readonly RegistryMember[];
  loadState: LoadState;
  /** 운영자만 전체 목록을 이미지로 받는다. */
  isAdmin: boolean;
  onNotify: (message: string) => void;
}

function RankBadge({ rank }: { rank: Rank }) {
  return (
    <span className="rankBadge" style={{ color: rank.color, background: `${rank.color}1A` }}>
      <svg className="rankBadge__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d={ICON_PATHS[rank.icon]}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={rank.icon === 'gem' ? 0.8 : 0}
          strokeLinejoin="round"
        />
      </svg>
      {rank.label}
    </span>
  );
}

/**
 * 회원관리 › 점수관리 — the 회원 명단 ranked by average, readable by everyone.
 * Scores come from the last 회원등록 import.
 */
export function ScoresScreen({ registry, loadState, isAdmin, onNotify }: Props) {
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const ranked = useMemo(() => registry.slice().sort(byScore), [registry]);
  const q = query.trim();
  const shown = q ? ranked.filter((m) => m.name.includes(q)) : ranked;

  // 검색과 상관없이 전체 목록을 담는다.
  const download = async () => {
    setSaving(true);
    try {
      await downloadScoreImage(ranked);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '이미지 저장에 실패했어요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen">
      <div className="eyebrow">회원관리</div>
      <div className="title">점수관리</div>
      <div className="histSub">
        최근 {RECENT_GAMES}게임 평균 순이에요.
        {isAdmin && ' 점수는 회원등록에서 엑셀을 가져오면 갱신돼요.'}
      </div>

      <div className="registryHead">
        <span className="registryHead__title">회원 {ranked.length}명</span>
        {ranked.length > 0 && (
          <div className="registryHead__tools">
            {isAdmin && (
              <button
                type="button"
                className="registryHead__btn"
                onClick={() => void download()}
                disabled={saving}
              >
                {saving ? '만드는 중…' : '이미지 저장'}
              </button>
            )}
            <input
              className="registrySearch"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색"
              aria-label="회원 이름 검색"
            />
          </div>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="registryEmpty">
          {loadState === 'loading' ? '불러오는 중…' : '아직 등록된 회원이 없어요.'}
        </div>
      ) : (
        <div className="card">
          {shown.map((m) => {
            const has = scored(m);
            return (
              <div className="scoreRow" key={m.id}>
                <div className="scoreRow__who">
                  <span className="registryRow__no">{has ? ranked.indexOf(m) + 1 : ''}</span>
                  <span className="memberRow__name">{m.name}</span>
                  <span className="registryRow__meta">{gamesLabel(m)}</span>
                </div>
                <div className="scoreRow__rank">{has && <RankBadge rank={rankOf(m.avg)} />}</div>
                <div
                  className={`scoreRow__avg${has && m.avg >= HIGH_AVG ? ' scoreRow__avg--high' : ''}`}
                >
                  {has ? avgLabel(m.avg) : '–'}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <div className="registryEmpty">"{q}" 회원이 없어요.</div>}
        </div>
      )}
    </div>
  );
}
