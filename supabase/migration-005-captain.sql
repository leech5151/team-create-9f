-- ============================================================================
--  005 — 팀장 표시
--
--  migration-004 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  팀짜기가 임시 상태를 들고 있지 않고 곧바로 DB에 쓰도록 바뀌면서, 누가
--  팀장인지도 저장돼야 합니다. 배정 순서로 추정하면 멤버를 교체할 때
--  팀장이 바뀌어 버리므로 명시적인 컬럼을 둡니다.
-- ============================================================================

alter table season_players add column if not exists is_captain boolean not null default false;

comment on column season_players.is_captain is '팀장 여부 — 팀마다 최대 한 명';

-- 한 팀에 팀장이 둘일 수 없다. team_id 가 null 인 미배정 행은 대상에서 제외한다.
create unique index if not exists uniq_captain_per_team
  on season_players (season_id, team_id)
  where is_captain and team_id is not null;
