begin;

alter table public.stores
  alter column owner_id drop not null;

alter table public.stores
  drop constraint if exists stores_owner_id_fkey;

alter table public.stores
  add constraint stores_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

drop policy if exists "stores owner manage" on public.stores;
drop policy if exists "stores authenticated read" on public.stores;
create policy "stores authenticated read" on public.stores
  for select to authenticated using (true);

drop policy if exists "events owner manage through store" on public.events;
drop policy if exists "events authenticated read" on public.events;
create policy "events authenticated read" on public.events
  for select to authenticated using (true);

drop policy if exists "posts owner manage through store" on public.posts;
drop policy if exists "posts authenticated read" on public.posts;
create policy "posts authenticated read" on public.posts
  for select to authenticated using (true);

drop policy if exists "situations owner manage through store" on public.store_situations;
drop policy if exists "situations authenticated read" on public.store_situations;
create policy "situations authenticated read" on public.store_situations
  for select to authenticated using (true);

drop policy if exists "bbs sources owner manage through store" on public.bbs_sources;
drop policy if exists "bbs sources authenticated read" on public.bbs_sources;
create policy "bbs sources authenticated read" on public.bbs_sources
  for select to authenticated using (true);

drop policy if exists "crawl runs owner read through store" on public.crawl_runs;
drop policy if exists "crawl runs owner manage through store" on public.crawl_runs;
drop policy if exists "crawl runs authenticated read" on public.crawl_runs;
create policy "crawl runs authenticated read" on public.crawl_runs
  for select to authenticated using (true);

drop policy if exists "bbs snapshots owner read through store" on public.bbs_snapshots;
drop policy if exists "bbs snapshots owner manage through store" on public.bbs_snapshots;
drop policy if exists "bbs snapshots authenticated read" on public.bbs_snapshots;
create policy "bbs snapshots authenticated read" on public.bbs_snapshots
  for select to authenticated using (true);

commit;
