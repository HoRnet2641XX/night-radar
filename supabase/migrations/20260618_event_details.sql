alter table public.events
  add column if not exists details text not null default '';
