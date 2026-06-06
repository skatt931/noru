create type public.venue_status as enum ('pending', 'approved', 'rejected');

create table public.venues (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) >= 2),
  google_maps_url text not null check (google_maps_url ~* '^https?://'),
  comment text not null check (char_length(trim(comment)) >= 3),
  owners text,
  status public.venue_status not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id)
);

create index venues_approved_by_idx on public.venues (approved_by);

create table public.reviewers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index reviewers_singleton_idx on public.reviewers ((true));

create schema if not exists private;

create or replace function private.reviewers_slot_available()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.reviewers);
$$;

alter table public.venues enable row level security;
alter table public.reviewers enable row level security;

create policy "Approved venues are public"
on public.venues
for select
to anon
using (status = 'approved');

create policy "Approved venues are readable by authenticated users"
on public.venues
for select
to authenticated
using (
  status = 'approved'
  or exists (
    select 1
    from public.reviewers
    where reviewers.user_id = (select auth.uid())
  )
);

create policy "Anyone can submit pending venues"
on public.venues
for insert
to anon, authenticated
with check (
  status = 'pending'
  and approved_at is null
  and approved_by is null
);

create policy "Reviewers can update venue status"
on public.venues
for update
to authenticated
using (
  exists (
    select 1
    from public.reviewers
    where reviewers.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.reviewers
    where reviewers.user_id = (select auth.uid())
  )
);

create policy "Reviewer can see their own membership"
on public.reviewers
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "First authenticated user can become reviewer"
on public.reviewers
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.reviewers_slot_available()
);

-- Optional: allow realtime later if needed.
-- alter publication supabase_realtime add table public.venues;

-- Setup reminder:
-- 1. The first authenticated user can self-assign reviewer role from the app.
-- 2. Or you can add a reviewer manually:
-- insert into public.reviewers (user_id) values ('00000000-0000-0000-0000-000000000000');
