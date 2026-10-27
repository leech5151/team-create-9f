-- ============================================================================
--  011 — 정모 회원 명단 (칠텐 기록등록 양식 가져오기)
--
--  migration-010 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  meetup_members 에는 지금까지 정모에 한 번이라도 저장된 사람이 모두
--  들어 있었습니다 — 게스트와 신입도요. 회원 명단은 칠텐 엑셀을 가져온
--  사람만으로 만들고, 정모에서 직접 입력한 사람은 여기에 올리지 않습니다.
--  두 부류가 같은 테이블을 쓰는 이유는 meetup_attendees 가 member_id 로
--  양쪽 모두를 참조해야 하기 때문입니다.
-- ============================================================================

alter table meetup_members add column if not exists registered  boolean not null default false;
-- 칠텐 양식의 '번호'. 이름이 겹치는 회원이 많아 이름 대신 이 번호로 같은 사람을 찾습니다.
alter table meetup_members add column if not exists record_no   int;
alter table meetup_members add column if not exists birth       text;
-- 엑셀에 기록된 게임 수와 마지막 기록일 — 명단에서 활동 회원을 앞에 두는 데 씁니다.
alter table meetup_members add column if not exists games       int not null default 0;
alter table meetup_members add column if not exists last_played date;

create unique index if not exists idx_meetup_members_record_no
  on meetup_members(record_no) where record_no is not null;

comment on column meetup_members.registered  is '회원 명단에 있는지 — 엑셀 가져오기로만 켜진다';
comment on column meetup_members.record_no   is '칠텐 기록등록 양식의 번호';
comment on column meetup_members.birth       is '생년월일 yyyymmdd';
comment on column meetup_members.games       is '엑셀에 기록된 전체 게임 수 (에버리지는 최근 12게임)';
comment on column meetup_members.last_played is '엑셀 기준 마지막 기록일';
