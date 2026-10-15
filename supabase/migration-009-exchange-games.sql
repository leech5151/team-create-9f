-- ============================================================================
--  009 — 교류전 경기설정: 레인 설정 · 게임 · 게임별 레인 배치
--
--  migration-008 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  명단과 마찬가지로 회차 없이 '지금 교류전' 하나만 저장합니다.
--  게임마다 팀 짜는 방식이 다를 수 있어서 방식과 배치는 게임 단위입니다.
-- ============================================================================

-- ─── 레인 설정: 설정 행에 붙인다 ─────────────────────────────────────────────
--  lane_count 0 = 인원에 맞춰 자동. 2레인이 한 테이블이라 짝수만 씁니다.
alter table exchange_settings
  add column if not exists first_lane int not null default 1,
  add column if not exists lane_count int not null default 0;

alter table exchange_settings drop constraint if exists exchange_settings_first_lane_check;
alter table exchange_settings drop constraint if exists exchange_settings_lane_count_check;
alter table exchange_settings
  add constraint exchange_settings_first_lane_check check (first_lane between 1 and 99),
  add constraint exchange_settings_lane_count_check check (lane_count between 0 and 98 and lane_count % 2 = 0);

-- ─── 게임: 번호와 팀 짜는 방식 ──────────────────────────────────────────────
--  clubs   = 팀vs팀   (한 테이블이 한 클럽)
--  mixed   = 믹스팀   (한 테이블에 양 클럽 반반, 레인은 클럽별)
--  shuffle = 완전섞기 (레인까지 섞음)
create table if not exists exchange_games (
  no         int  primary key check (no between 1 and 99),
  method     text not null check (method in ('clubs', 'mixed', 'shuffle')),
  created_at timestamptz not null default now()
);

-- ─── 게임별 레인 배치 ───────────────────────────────────────────────────────
--  lane_idx 는 0부터 세는 상대 위치입니다. 실제 레인 번호는
--  first_lane + lane_idx — 시작 레인을 바꿔도 배치를 다시 짤 필요가 없습니다.
create table if not exists exchange_lanes (
  game_no   int  not null references exchange_games(no)   on delete cascade,
  player_id uuid not null references exchange_players(id) on delete cascade,
  lane_idx  int  not null check (lane_idx between 0 and 97),
  slot      int  not null default 0,
  primary key (game_no, player_id)
);

create index if not exists idx_exchange_lanes_game on exchange_lanes(game_no);

comment on table exchange_games is '교류전 게임 — 게임마다 팀 짜는 방식';
comment on table exchange_lanes is '교류전 게임별 레인 배치 (lane_idx 는 시작 레인 기준 상대 위치)';


-- ============================================================================
--  Row Level Security — 읽기 누구나, 쓰기 운영자.
-- ============================================================================

alter table exchange_games enable row level security;
alter table exchange_lanes enable row level security;

drop policy if exists "public read" on exchange_games;
drop policy if exists "public read" on exchange_lanes;

create policy "public read" on exchange_games for select using (true);
create policy "public read" on exchange_lanes for select using (true);

drop policy if exists "admin write" on exchange_games;
drop policy if exists "admin write" on exchange_lanes;

create policy "admin write" on exchange_games for all to authenticated using (true) with check (true);
create policy "admin write" on exchange_lanes for all to authenticated using (true) with check (true);
