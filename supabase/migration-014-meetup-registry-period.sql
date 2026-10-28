-- ============================================================================
--  014 — 회원 명단: 엑셀 기간
--
--  migration-013 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  회원등록은 엑셀에 담긴 기간(보통 3개월)의 전체 게임 평균으로 점수를
--  정합니다. 점수관리에 "최근 3개월 평균"처럼 보여 주려고, 마지막으로 가져온
--  엑셀의 첫 경기일·마지막 경기일을 한 줄로 남깁니다.
-- ============================================================================

create table if not exists meetup_registry_info (
  id          int  primary key default 1 check (id = 1),
  sheet_from  date not null,
  sheet_to    date not null,
  imported_at timestamptz not null default now()
);

comment on table meetup_registry_info is '마지막으로 가져온 회원 엑셀의 기간';

alter table meetup_registry_info enable row level security;

drop policy if exists "public read" on meetup_registry_info;
create policy "public read" on meetup_registry_info for select using (true);

drop policy if exists "admin write" on meetup_registry_info;
create policy "admin write" on meetup_registry_info for all to authenticated using (true) with check (true);
