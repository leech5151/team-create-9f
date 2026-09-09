-- ============================================================================
--  007 — 총점 가감 (지각 패널티)
--
--  migration-006 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  선수의 핸디·패널티(migration-002)와 대진 핸디캡은 매 게임에 적용됩니다.
--  지각처럼 그날 한 번만 따지는 벌점은 그 셈에 맞지 않습니다 — 게임마다 3번
--  빠지면 벌점이 세 배가 되고, 게임별 승패까지 뒤집히기 때문입니다.
--
--  그래서 경기의 팀별로 '3게임 총점에만 한 번' 더하는 값을 둡니다. 부호가
--  있어서 감점(-)뿐 아니라 가점(+)도 줄 수 있고, 게임 3승은 건드리지 않고
--  총점 1승과 누적득점(순위 타이브레이크)에만 반영됩니다.
-- ============================================================================

alter table matches add column if not exists home_total_adjust int not null default 0;
alter table matches add column if not exists away_total_adjust int not null default 0;

comment on column matches.home_total_adjust is '홈팀 총점 가감 (지각 패널티 등) — 3게임 총점에 한 번만 적용';
comment on column matches.away_total_adjust is '원정팀 총점 가감 (지각 패널티 등) — 3게임 총점에 한 번만 적용';

-- 오타로 총점이 뒤집히는 일을 막는 정도의 상한. 3게임 총점 규모를 넘지 않는다.
alter table matches drop constraint if exists matches_total_adjust_range;
alter table matches add constraint matches_total_adjust_range check (
  home_total_adjust between -900 and 900 and away_total_adjust between -900 and 900
);

-- RLS 는 matches 에 이미 걸려 있으므로(schema.sql) 추가 정책이 필요 없습니다.
