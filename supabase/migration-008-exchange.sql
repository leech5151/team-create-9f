-- ============================================================================
--  008 — 교류전 선수명단
--
--  migration-007 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  교류전은 언제나 두 팀(우리 / 상대)의 1:1 대결입니다. 회차별 기록을 남기지
--  않고 '지금 유효한 명단' 하나만 유지합니다 — 다음 교류전은 명단을 고쳐
--  쓰거나 비우고 새로 넣습니다.
--
--  상주리그 players · 정모 meetup_members 와는 분리합니다. 상대 팀 선수는
--  우리 클럽 사람이 아니고, 교류전 때문에 리그 점수를 건드릴 일도 없습니다.
-- ============================================================================

-- ─── 설정: 행 하나짜리 테이블 ───────────────────────────────────────────────
--  팀 이름과 여성 핸디. id 를 1 로 못박아 행이 둘 생기지 않게 합니다.
create table if not exists exchange_settings (
  id                    int  primary key default 1 check (id = 1),
  home_name             text not null default '우리 팀',
  away_name             text not null default '상대 팀',
  female_handicap_on    boolean not null default false,
  -- 여성 선수 전원에게 일괄로 더하는 게임당 핸디.
  female_handicap       int  not null default 0 check (female_handicap between 0 and 100),
  updated_at            timestamptz not null default now()
);

insert into exchange_settings (id) values (1) on conflict (id) do nothing;

-- ─── 선수: side 로 어느 팀인지 구분 ─────────────────────────────────────────
create table if not exists exchange_players (
  id         uuid primary key default gen_random_uuid(),
  side       text not null check (side in ('home', 'away')),
  name       text not null,
  gender     text not null check (gender in ('남', '여')),
  avg        int  not null check (avg between 0 and 300),
  created_at timestamptz not null default now()
);

create index if not exists idx_exchange_players_side on exchange_players(side);

comment on table  exchange_settings is '교류전 설정 — 팀 이름과 여성 핸디 (행 하나)';
comment on table  exchange_players  is '교류전 선수명단 — 회차 없이 현재 명단만';
comment on column exchange_players.side is 'home = 우리 팀, away = 상대 팀';


-- ============================================================================
--  Row Level Security — 다른 테이블과 같은 규칙.
--  읽기: 누구나.  쓰기: 로그인한 사용자만 (= 운영자 계정).
-- ============================================================================

alter table exchange_settings enable row level security;
alter table exchange_players  enable row level security;

drop policy if exists "public read" on exchange_settings;
drop policy if exists "public read" on exchange_players;

create policy "public read" on exchange_settings for select using (true);
create policy "public read" on exchange_players  for select using (true);

drop policy if exists "admin write" on exchange_settings;
drop policy if exists "admin write" on exchange_players;

create policy "admin write" on exchange_settings for all to authenticated using (true) with check (true);
create policy "admin write" on exchange_players  for all to authenticated using (true) with check (true);
