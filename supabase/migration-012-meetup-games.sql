-- ============================================================================
--  012 — 정모 기록: 게임별 레인 배정
--
--  migration-011 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  meetup_attendees 는 사람마다 레인 하나만 담아서 '지금 배정'만 남았습니다.
--  정모는 보통 여러 게임을 치고 게임마다 다시 짜므로, 기록 화면의 GAME 1·2·3
--  배정을 여기에 게임 단위로 저장합니다. 중복 방지·같은 레인 방지도 다시
--  열었을 때 이 기록을 기준으로 동작합니다.
-- ============================================================================

create table if not exists meetup_games (
  meetup_id  uuid not null references meetups(id) on delete cascade,
  game       int  not null check (game >= 1),
  -- 그 게임의 시작 레인. 게임 사이에 레인 번호대가 바뀌어도 기록은 그대로다.
  first_lane int  not null default 1 check (first_lane between 1 and 99),
  -- 레인별 멤버 id 배열의 배열 — [["id1","id2"],["id3","id4","id5"]]
  lanes      jsonb not null,
  primary key (meetup_id, game)
);

comment on table meetup_games is '정모 게임별 레인 배정 기록';

alter table meetup_games enable row level security;

drop policy if exists "public read" on meetup_games;
create policy "public read" on meetup_games for select using (true);

drop policy if exists "admin write" on meetup_games;
create policy "admin write" on meetup_games for all to authenticated using (true) with check (true);
