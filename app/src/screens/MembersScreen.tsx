import { useMemo, useRef, useState } from 'react';
import type { Gender, Member } from '../types';
import {
  avgLabel,
  birthLabel,
  byActivity,
  parseRecordSheet,
  periodMonths,
  periodRange,
  planImport,
  type ImportPlan,
  type RegistryMember,
} from '../meetup/registry';
import { readFirstSheet } from '../lib/xlsx';
import type { LoadState } from '../league/useLeague';

interface Props {
  /** The 명단 as stored on the server. */
  registry: readonly RegistryMember[];
  /** False until migration-011 has been run on the server. */
  registryReady: boolean;
  loadState: LoadState;
  loadError: string | null;
  /** Members already saved to past 정모 — matched so a person keeps one id. */
  saved: readonly Member[];
  busy: boolean;
  onApply: (plan: ImportPlan) => Promise<void>;
  onSetGender: (id: string, gender: Gender) => void;
}

/**
 * 회원관리 › 회원등록 — the 정모 회원 명단, built only by importing the 칠텐 기록등록 양식.
 *
 * Operator-only. Guests and newcomers are typed in on the 명단 screen instead
 * and never land here.
 */
export function MembersScreen({
  registry,
  registryReady,
  loadState,
  loadError,
  saved,
  busy,
  onApply,
  onSetGender,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ fileName: string; plan: ImportPlan } | null>(null);
  const [query, setQuery] = useState('');

  const registered = useMemo(() => registry.slice().sort(byActivity), [registry]);
  const q = query.trim();
  const shown = q ? registered.filter((m) => m.name.includes(q)) : registered;

  const pick = async (file: File) => {
    setReading(true);
    setError(null);
    setPlan(null);
    try {
      const sheet = parseRecordSheet(await readFirstSheet(file));
      setPlan({ fileName: file.name, plan: planImport(sheet, registry, saved) });
    } catch (e) {
      setError(e instanceof Error ? e.message : '엑셀을 읽지 못했어요.');
    } finally {
      setReading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    await onApply(plan.plan);
    setPlan(null);
  };

  /*
   * Reading the file is always allowed — it happens in the browser. Saving
   * needs the current 명단 from the server, or the import could not tell who
   * is already on it and would duplicate everyone.
   */
  const blocked =
    loadState === 'loading'
      ? '서버에서 지금 명단을 불러오는 중이에요.'
      : loadState === 'unconfigured'
        ? 'Supabase 설정(.env)이 없어 저장할 수 없어요.'
        : loadState === 'offline'
          ? `서버 조회에 실패했어요: ${loadError ?? '알 수 없는 오류'}`
          : !registryReady
            ? '서버 DB에 회원 명단 컬럼이 없어요. Supabase SQL Editor에서 supabase/migration-011-meetup-registry.sql 을 실행해 주세요.'
            : null;

  return (
    <div className="screen">
      <div className="eyebrow">회원관리 · 운영자</div>
      <div className="title">회원등록</div>

      <div className="registryImport">
        <div className="registryImport__text">
          칠텐 기록등록 양식(.xlsx)을 가져오면 회원 명단을 새로 만들어요. 번호로 같은 회원을 찾고,
          점수는 엑셀에 담긴 기간(보통 3개월)의 전체 게임 평균으로 정해요.
          <br />
          게스트·신입은 명단 화면에서 직접 입력하고, 여기에는 올라가지 않아요.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 같은 파일을 다시 골라도 change 가 오도록 비운다.
            e.target.value = '';
            if (file) void pick(file);
          }}
        />
        <button
          type="button"
          className="registryImport__btn"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
        >
          {reading ? '읽는 중…' : '엑셀 가져오기'}
        </button>
        {error && <div className="field__error">{error}</div>}
        {blocked && <div className="field__error">{blocked}</div>}

        {plan && (
          <div className="registryPlan">
            <div className="registryPlan__file">
              {plan.fileName}
              {plan.plan.period &&
                ` · ${periodRange(plan.plan.period)} (${periodMonths(plan.plan.period)}개월)`}
            </div>
            <div className="registryPlan__counts">
              <span>
                전체 <b>{plan.plan.rows.length}</b>명
              </span>
              <span>
                신규 <b>{plan.plan.added}</b>
              </span>
              <span>
                갱신 <b>{plan.plan.updated}</b>
              </span>
              {plan.plan.carried > 0 && (
                <span>
                  정모 멤버 유지 <b>{plan.plan.carried}</b>
                </span>
              )}
              {plan.plan.removedIds.length > 0 && (
                <span>
                  명단에서 빠짐 <b>{plan.plan.removedIds.length}</b>
                </span>
              )}
            </div>
            <div className="registryPlan__actions">
              <button
                type="button"
                className="registryPlan__apply"
                onClick={() => void apply()}
                disabled={busy || blocked !== null}
              >
                {busy ? '저장 중…' : '명단에 반영'}
              </button>
              <button
                type="button"
                className="registryPlan__cancel"
                onClick={() => setPlan(null)}
                disabled={busy}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="registryHead">
        <span className="registryHead__title">회원 {registered.length}명</span>
        {registered.length > 0 && (
          <input
            className="registrySearch"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            aria-label="회원 이름 검색"
          />
        )}
      </div>

      {registered.length === 0 ? (
        <div className="registryEmpty">아직 등록된 회원이 없어요. 엑셀을 가져와 주세요.</div>
      ) : (
        <div className="card">
          {shown.map((m) => (
            <div className="memberRow registryRow" key={m.id}>
              <div className="registryRow__no">{m.recordNo ?? ''}</div>
              <div className="registryRow__who">
                <div className="memberRow__name">{m.name}</div>
                {/* 한 줄에 다 들어가도록 날짜는 26.10.19 처럼 줄여 쓴다. */}
                <div className="registryRow__meta">
                  {[
                    birthLabel(m.birth),
                    m.lastPlayed
                      ? m.lastPlayed.slice(2).replace(/-/g, '.')
                      : m.recordNo === null
                        ? '정모 멤버'
                        : '기록 없음',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {/* 양식에 성별 칸이 없어 여기서 정한다. 다시 가져와도 유지된다. */}
              <button
                type="button"
                className={`registryRow__gender${m.gender === '여' ? ' registryRow__gender--f' : ''}`}
                onClick={() => onSetGender(m.id, m.gender === '남' ? '여' : '남')}
                disabled={busy}
                aria-label={`${m.name} 성별 ${m.gender} — 눌러서 바꾸기`}
              >
                {m.gender}
              </button>
              <div className="registryRow__avg">
                {m.games > 0 || m.recordNo === null ? avgLabel(m.avg) : '–'}
              </div>
            </div>
          ))}
          {shown.length === 0 && <div className="registryEmpty">"{q}" 회원이 없어요.</div>}
        </div>
      )}
    </div>
  );
}
