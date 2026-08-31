-- ============================================================================
--  003 — 회차 시작 날짜와 경기 날짜
--
--  migration-002 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  주차는 회차 시작일로부터 7일 단위로 계산합니다.
--    N주차 = [start_date + (N-1)*7, start_date + N*7 - 1]
--  주차별 날짜를 따로 저장하지 않는 이유는, 시작일 하나만 고치면 전체 일정이
--  따라 움직이게 하기 위해서입니다.
--
--  경기는 그 주 안의 특정 날짜에 열리므로 matches 에 실제 날짜를 둡니다.
--  요일만 저장하면 회차가 밀렸을 때 실제 날짜를 복원할 수 없습니다.
-- ============================================================================

alter table seasons add column if not exists start_date date;
alter table matches add column if not exists played_on  date;

comment on column seasons.start_date is '회차 시작일 — 1주차가 시작되는 날';
comment on column matches.played_on  is '경기 날짜 — 해당 주차 7일 중 하루';

-- 날짜순 조회가 기본이 되므로 인덱스를 둔다.
create index if not exists idx_matches_played_on on matches(played_on);
