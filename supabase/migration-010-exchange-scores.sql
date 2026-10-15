-- ============================================================================
--  010 — 교류전 경기진행: 게임별 선수 점수
--
--  migration-009 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
--  점수는 핸디를 빼고 친 그대로 저장합니다. 핸디는 설정의 여성 핸디로
--  계산해서 더하므로, 핸디를 바꿔도 점수를 다시 넣을 필요가 없습니다.
-- ============================================================================

create table if not exists exchange_scores (
  game_no   int  not null references exchange_games(no)   on delete cascade,
  player_id uuid not null references exchange_players(id) on delete cascade,
  score     int  not null check (score between 0 and 300),
  primary key (game_no, player_id)
);

create index if not exists idx_exchange_scores_game on exchange_scores(game_no);

comment on table exchange_scores is '교류전 게임별 선수 점수 (핸디 미포함)';

alter table exchange_scores enable row level security;

drop policy if exists "public read" on exchange_scores;
create policy "public read" on exchange_scores for select using (true);

drop policy if exists "admin write" on exchange_scores;
create policy "admin write" on exchange_scores for all to authenticated using (true) with check (true);
