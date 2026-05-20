-- Supabase SQL for global public product votes
-- Run this in Supabase Dashboard > SQL Editor before deploying.

create table if not exists public.product_votes (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  voter_id text not null,
  created_at timestamptz not null default now(),
  unique (product_id, voter_id)
);

alter table public.product_votes enable row level security;

drop policy if exists "Anyone can read votes" on public.product_votes;
create policy "Anyone can read votes"
on public.product_votes
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can insert one vote" on public.product_votes;
create policy "Anyone can insert one vote"
on public.product_votes
for insert
to anon, authenticated
with check (true);

-- No update/delete policies are created, so public visitors cannot change or remove votes.

create or replace view public.product_vote_counts as
select product_id, count(*)::int as votes
from public.product_votes
group by product_id;

grant select on public.product_vote_counts to anon, authenticated;
grant select, insert on public.product_votes to anon, authenticated;
