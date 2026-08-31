-- ============================================================================
--  004 — 경기 시작 시간
--
--  migration-003 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  날짜(played_on)와 시간을 나눠 두는 이유:
--    · 시간 미정인 대진을 먼저 공지할 수 있어야 하고
--    · timestamptz 를 쓰면 보는 사람의 시간대에 따라 표시가 흔들립니다.
--      리그는 한 지역에서만 열리므로 벽시계 시간을 그대로 저장합니다.
-- ============================================================================

alter table matches add column if not exists start_time time;

comment on column matches.start_time is '경기 시작 시간 (미정이면 null)';

-- 날짜 → 시간 순 조회가 기본이 된다.
create index if not exists idx_matches_schedule on matches(played_on, start_time);
