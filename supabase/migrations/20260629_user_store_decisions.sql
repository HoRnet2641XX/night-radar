create table if not exists public.user_store_decisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id text not null references public.stores(id) on delete cascade,
  decision text not null check (decision in ('candidate', 'favorite', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

alter table public.user_store_decisions
  drop constraint if exists user_store_decisions_decision_check;

alter table public.user_store_decisions
  add constraint user_store_decisions_decision_check
  check (decision in ('candidate', 'favorite', 'hidden'));

alter table public.user_store_decisions enable row level security;

drop policy if exists "store decisions owner manage" on public.user_store_decisions;
create policy "store decisions owner manage" on public.user_store_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists user_store_decisions_updated_at on public.user_store_decisions;
create trigger user_store_decisions_updated_at before update on public.user_store_decisions
  for each row execute function public.set_updated_at();
