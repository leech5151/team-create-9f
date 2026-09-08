-- ============================================================================
--  006 — 정모 (정기모임) 저장
--
--  migration-005 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  팀짜기는 지금까지 브라우저 localStorage 만 썼습니다. 그래서 뽑은 결과가
--  뽑은 사람 기기에만 남고 공유가 안 됐습니다. 운영자가 정모를 저장하면
--  누구나 같은 명단과 레인 배정을 보도록 여기에 테이블을 둡니다.
--
--  상주리그의 players 와는 분리합니다 — 정모에는 리그에 등록되지 않은
--  손님이 오고, 리그 선수의 점수·핸디를 정모 때문에 건드릴 일도 없습니다.
-- ============================================================================

-- ─── 정모 멤버 마스터 (정모를 넘어 유지되므로 정모와 분리) ──────────────────
--  id 가 uuid 가 아니라 text 입니다. 팀짜기는 오프라인에서도 멤버를 추가할 수
--  있어야 하므로 id 를 앱이 만들고, 저장할 때 그 id 로 upsert 합니다. 그래야
--  같은 사람이 두 번 올라가지 않고, 개명해도 기록이 그 사람에 붙어 있습니다.
--  (기존 명단의 'm1' 같은 id 도 그대로 올라갑니다.)
--
--  avg 는 팀짜기 배정 알고리즘이 티어를 나누는 기준이라 필수입니다.
--  (리그 players.avg 는 미기입을 허용하지만, 여기서는 배정이 목적입니다.)
create table if not exists meetup_members (
  id         text primary key,
  name       text not null,
  gender     text not null check (gender in ('남', '여')),
  avg        int  not null check (avg between 0 and 300),
  created_at timestamptz not null default now()
);

-- ─── 정모: 날짜마다 하나 ────────────────────────────────────────────────────
--  lane_count / first_lane 은 그날 볼링장에서 받은 레인 번호대입니다.
--  8레인을 3번부터 받으면 3~10번 — 팀짜기의 '레인 설정'이 그대로 저장됩니다.
create table if not exists meetups (
  id         uuid primary key default gen_random_uuid(),
  met_on     date not null,
  title      text,
  lane_count int  not null default 0 check (lane_count between 0 and 99),
  first_lane int  not null default 1 check (first_lane between 1 and 99),
  created_at timestamptz not null default now(),
  unique (met_on)
);

-- ─── 참석자 + 배정된 레인 ───────────────────────────────────────────────────
--  한 행이 '이 정모에 이 멤버가 참석하고, 몇 번 레인 몇 번째 자리에 앉는다'.
--  lane_no 가 null 이면 참석은 확정이지만 아직 뽑지 않은 상태입니다.
create table if not exists meetup_attendees (
  meetup_id uuid not null references meetups(id)        on delete cascade,
  member_id text not null references meetup_members(id) on delete cascade,
  lane_no   int check (lane_no between 1 and 99),
  -- 레인 안에서의 순서. 뽑은 순서를 보존해 다시 열어도 같은 줄로 보인다.
  slot      int not null default 0,
  primary key (meetup_id, member_id)
);

create index if not exists idx_meetup_attendees_meetup on meetup_attendees(meetup_id);
create index if not exists idx_meetups_met_on          on meetups(met_on desc);

comment on table  meetups             is '정기모임 — 날짜마다 하나';
comment on table  meetup_members      is '정모 멤버 마스터 (상주리그 players 와 별개)';
comment on table  meetup_attendees    is '정모 참석자와 배정된 레인';
comment on column meetup_attendees.lane_no is '배정된 레인 번호; null 이면 아직 뽑기 전';


-- ============================================================================
--  Row Level Security — 다른 테이블과 같은 규칙.
--  읽기: 누구나 (참석자가 자기 레인을 확인해야 하므로).
--  쓰기: 로그인한 사용자만 (= 운영자 계정).
-- ============================================================================

alter table meetup_members   enable row level security;
alter table meetups          enable row level security;
alter table meetup_attendees enable row level security;

drop policy if exists "public read" on meetup_members;
drop policy if exists "public read" on meetups;
drop policy if exists "public read" on meetup_attendees;

create policy "public read" on meetup_members   for select using (true);
create policy "public read" on meetups          for select using (true);
create policy "public read" on meetup_attendees for select using (true);

drop policy if exists "admin write" on meetup_members;
drop policy if exists "admin write" on meetups;
drop policy if exists "admin write" on meetup_attendees;

create policy "admin write" on meetup_members   for all to authenticated using (true) with check (true);
create policy "admin write" on meetups          for all to authenticated using (true) with check (true);
create policy "admin write" on meetup_attendees for all to authenticated using (true) with check (true);
