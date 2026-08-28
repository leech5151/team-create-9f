-- ============================================================================
--  002 — 선수 기본 수치 (핸디 / 패널티 / 점수)
--
--  schema.sql 을 이미 실행한 뒤에 추가로 실행하세요.
--  여러 번 실행해도 안전합니다.
--
--  핸디캡은 선수에게 붙는 값입니다. 운영자가 선수 등록·수정에서 넣고,
--  점수 계산은 이 값을 그대로 씁니다. 경기별로 따로 보관하지 않습니다.
-- ============================================================================

alter table players add column if not exists handicap int not null default 0;
alter table players add column if not exists penalty  int not null default 0;
alter table players add column if not exists avg      int;

-- 부호는 컬럼이 고정한다: 핸디는 더하고, 패널티는 뺀다.
-- 두 값 모두 0 이상의 크기로만 저장해 이중 부호 혼동을 막는다.
comment on column players.handicap is '핸디캡 — 매 게임 점수에 더해진다 (0 이상)';
comment on column players.penalty  is '패널티 — 매 게임 점수에서 빠진다 (0 이상)';
comment on column players.avg      is '에버리지 점수 (없으면 null)';

-- 값 범위 보호. 이미 있으면 건너뛴다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_handicap_range') then
    alter table players add constraint players_handicap_range
      check (handicap between 0 and 300);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'players_penalty_range') then
    alter table players add constraint players_penalty_range
      check (penalty between 0 and 300);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'players_avg_range') then
    alter table players add constraint players_avg_range
      check (avg is null or avg between 0 and 300);
  end if;
end $$;

-- match_players 는 "누가 출전했는지"만 남긴다. 핸디캡은 선수 쪽으로 옮겼으므로
-- schema.sql 초기 버전이 만든 컬럼을 정리한다.
alter table match_players drop column if exists handicap;
