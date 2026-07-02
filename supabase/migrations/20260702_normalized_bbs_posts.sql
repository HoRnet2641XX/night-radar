begin;

create table if not exists public.bbs_normalized_posts (
  id text primary key default gen_random_uuid()::text,
  source_id text references public.bbs_sources(id) on delete set null,
  store_id text not null references public.stores(id) on delete cascade,
  source_url text,
  article_no text,
  author_name text not null default '記載なし',
  author_gender text not null default '記載なし',
  posted_at timestamptz,
  observed_at timestamptz not null default now(),
  body text not null,
  body_hash text not null,
  content_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, content_key)
);

create index if not exists bbs_normalized_posts_store_observed_idx
  on public.bbs_normalized_posts (store_id, observed_at desc);

create index if not exists bbs_normalized_posts_store_posted_idx
  on public.bbs_normalized_posts (store_id, posted_at desc);

alter table public.bbs_normalized_posts enable row level security;

drop policy if exists "bbs normalized posts authenticated read" on public.bbs_normalized_posts;
create policy "bbs normalized posts authenticated read" on public.bbs_normalized_posts
  for select to authenticated using (true);

drop trigger if exists bbs_normalized_posts_updated_at on public.bbs_normalized_posts;
create trigger bbs_normalized_posts_updated_at before update on public.bbs_normalized_posts
  for each row execute function public.set_updated_at();

commit;
