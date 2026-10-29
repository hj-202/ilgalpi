-- 일갈피 계정 데이터 스키마 (PRD v2.3 §6.4, §12). Supabase SQL Editor에서 한 번 실행한다.
-- 모든 사용자 테이블은 (user_id, id)를 기본키로 둔다: 같은 기기의 비회원 기록(id 동일)을
-- 서로 다른 계정으로 가져와도 충돌하지 않고, 같은 계정으로 다시 가져와도 upsert로 멱등이다.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_minutes integer not null default 120 check (available_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  project_id text,
  title text not null check (char_length(title) between 1 and 100),
  planned_date date not null,
  due_date date,
  due_time text check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  importance text not null check (importance in ('low','medium','high')),
  effort text check (effort is null or effort in ('short','medium','long')),
  legacy_minutes integer,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id),
  check (due_time is null or due_date is not null)
);
create index if not exists tasks_user_planned_idx on public.tasks (user_id, planned_date);

create table if not exists public.daily_available (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  minutes integer not null check (minutes between 5 and 1440),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.recommendations (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

-- RLS: 본인(user_id = auth.uid()) 행만 조회·삽입·수정·삭제. anon 역할에는 정책이 없어 접근 불가.
do $$
declare t text;
begin
  foreach t in array array['user_preferences','projects','tasks','daily_available','recommendations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 의견: RLS 켜고 정책을 만들지 않는다 → anon/authenticated는 읽기·쓰기 불가. 서버 API가 service role로만 삽입한다.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- 서버 측 rate limit 카운터(서버리스는 메모리 카운터가 유지되지 않음). 요청자는 해시로만 저장한다.
create table if not exists public.rate_limits (
  bucket text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (bucket, subject_hash, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.hit_rate_limit(p_bucket text, p_subject text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits as r (bucket, subject_hash, window_start, hits)
  values (p_bucket, p_subject, w, 1)
  on conflict (bucket, subject_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return n <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;
