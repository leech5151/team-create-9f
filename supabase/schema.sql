-- ============================================================================
--  상주리그 — 스키마
--
--  형식: 3인 팀전. 주차마다 팀 1:1 대결, 3게임.
--        게임별 승자 1승 + 3게임 총점 승자 1승 = 경기당 최대 4승.
--
--  Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행하세요.
--  같은 파일을 다시 실행해도 안전합니다 (idempotent).
-- ============================================================================

-- ─── 시즌 (상주리그 N회) ────────────────────────────────────────────────────
create table if not exists seasons (
  id          uuid primary key default gen_random_uuid(),
  edition     int  not null,                       -- 1회, 2회 …
  title       text,                                -- 표시용 부제 (선택)
  total_weeks int  not null default 6 check (total_weeks between 1 and 20),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (edition)
);

-- ─── 선수 마스터 (시즌을 넘어 유지되므로 시즌과 분리) ──────────────────────
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  gender     text check (gender in ('남', '여')),
  memo       text,
  created_at timestamptz not null default now()
);

-- ─── 팀 (시즌마다 새로 구성) ────────────────────────────────────────────────
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, name)
);

-- ─── 시즌별 소속: 같은 선수가 회차마다 다른 팀일 수 있다 ────────────────────
create table if not exists season_players (
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id)  on delete cascade,
  team_id   uuid          references teams(id)    on delete set null,
  primary key (season_id, player_id)
);

-- ─── 주차 ───────────────────────────────────────────────────────────────────
create table if not exists weeks (
  id        uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  week_no   int  not null check (week_no >= 1),
  played_on date,
  unique (season_id, week_no)
);

-- ─── 경기: 주차 안의 팀 1:1 대결 ────────────────────────────────────────────
create table if not exists matches (
  id           uuid primary key default gen_random_uuid(),
  week_id      uuid not null references weeks(id) on delete cascade,
  home_team_id uuid not null references teams(id) on delete cascade,
  away_team_id uuid not null references teams(id) on delete cascade,
  lane_no      int,
  created_at   timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

-- ─── 출전 명단 ──────────────────────────────────────────────────────────────
--  누가 어느 팀으로 나왔는지만 기록한다.
--  핸디캡·패널티는 선수(players)에 붙는 값이다 — migration-002 참고.
create table if not exists match_players (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  team_id   uuid not null references teams(id)   on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  unique (match_id, player_id)
);

-- ─── 게임 점수: 선수별 3게임, 핸디캡 제외한 실투 점수 ───────────────────────
create table if not exists game_scores (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  game_no   int  not null check (game_no between 1 and 3),
  pins      int  not null check (pins between 0 and 300),
  unique (match_id, player_id, game_no)
);

create index if not exists idx_teams_season         on teams(season_id);
create index if not exists idx_weeks_season         on weeks(season_id);
create index if not exists idx_matches_week         on matches(week_id);
create index if not exists idx_match_players_match  on match_players(match_id);
create index if not exists idx_game_scores_match    on game_scores(match_id);


-- ============================================================================
--  Row Level Security
--
--  publishable key 는 번들에 노출되므로, 실제 방어선은 여기다.
--  읽기: 누구나.  쓰기: 로그인한 사용자만 (= 운영자 계정).
-- ============================================================================

alter table seasons        enable row level security;
alter table players        enable row level security;
alter table teams          enable row level security;
alter table season_players enable row level security;
alter table weeks          enable row level security;
alter table matches        enable row level security;
alter table match_players  enable row level security;
alter table game_scores    enable row level security;

drop policy if exists "public read" on seasons;
drop policy if exists "public read" on players;
drop policy if exists "public read" on teams;
drop policy if exists "public read" on season_players;
drop policy if exists "public read" on weeks;
drop policy if exists "public read" on matches;
drop policy if exists "public read" on match_players;
drop policy if exists "public read" on game_scores;

create policy "public read" on seasons        for select using (true);
create policy "public read" on players        for select using (true);
create policy "public read" on teams          for select using (true);
create policy "public read" on season_players for select using (true);
create policy "public read" on weeks          for select using (true);
create policy "public read" on matches        for select using (true);
create policy "public read" on match_players  for select using (true);
create policy "public read" on game_scores    for select using (true);

drop policy if exists "admin write" on seasons;
drop policy if exists "admin write" on players;
drop policy if exists "admin write" on teams;
drop policy if exists "admin write" on season_players;
drop policy if exists "admin write" on weeks;
drop policy if exists "admin write" on matches;
drop policy if exists "admin write" on match_players;
drop policy if exists "admin write" on game_scores;

-- `to authenticated` = 로그인한 세션만. 익명 방문자는 읽기 정책만 적용된다.
create policy "admin write" on seasons        for all to authenticated using (true) with check (true);
create policy "admin write" on players        for all to authenticated using (true) with check (true);
create policy "admin write" on teams          for all to authenticated using (true) with check (true);
create policy "admin write" on season_players for all to authenticated using (true) with check (true);
create policy "admin write" on weeks          for all to authenticated using (true) with check (true);
create policy "admin write" on matches        for all to authenticated using (true) with check (true);
create policy "admin write" on match_players  for all to authenticated using (true) with check (true);
create policy "admin write" on game_scores    for all to authenticated using (true) with check (true);
