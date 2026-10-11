-- Run this once in the Supabase SQL editor for the content planner project.
create table if not exists public.shoots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  shoot_date date not null,
  shoot_time time,
  location text not null default '',
  details text not null default '',
  published_date date,
  shot boolean not null default false,
  edited boolean not null default false,
  published boolean not null default false,
  platforms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due_date date not null,
  due_time time,
  note text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shoots enable row level security;
alter table public.reminders enable row level security;

grant select, insert, update, delete on public.shoots to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;

create policy "Users can read their shoots" on public.shoots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their shoots" on public.shoots
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their shoots" on public.shoots
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their shoots" on public.shoots
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read their reminders" on public.reminders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their reminders" on public.reminders
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their reminders" on public.reminders
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their reminders" on public.reminders
  for delete to authenticated using ((select auth.uid()) = user_id);
