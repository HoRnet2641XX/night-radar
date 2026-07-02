create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'light', 'standard', 'premium')),
  status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  area text not null default '未設定',
  has_daytime boolean not null default false,
  has_night boolean not null default true,
  opening_hour_day text not null default '13:00',
  opening_hour_night text not null default '19:00',
  pr_structure text not null default '未分類',
  strong_days text[] not null default '{}',
  strong_events text[] not null default '{}',
  weak_events text[] not null default '{}',
  trust_seed integer not null default 60 check (trust_seed between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key default gen_random_uuid()::text,
  store_id text not null references public.stores(id) on delete cascade,
  date_label text not null default '今日',
  weekday text not null default '未設定',
  starts_at text not null default '19:00',
  session text not null check (session in ('day', 'night')),
  category text not null default '未分類',
  title text not null,
  details text not null default '',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id text primary key default gen_random_uuid()::text,
  store_id text not null references public.stores(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'csv', 'scrape', 'ai')),
  source_url text,
  posted_at timestamptz not null default now(),
  body text not null,
  body_hash text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists posts_store_hash_idx on public.posts (store_id, body_hash) where body_hash is not null;
create index if not exists posts_store_posted_at_idx on public.posts (store_id, posted_at desc);

create table if not exists public.store_situations (
  id text primary key default gen_random_uuid()::text,
  store_id text not null references public.stores(id) on delete cascade,
  status text not null default 'watch' check (status in ('open', 'event', 'crowded', 'watch', 'closed')),
  title text not null,
  note text not null default '',
  source_url text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bbs_sources (
  id text primary key default gen_random_uuid()::text,
  store_id text not null references public.stores(id) on delete cascade,
  label text not null default 'BBS',
  url text not null,
  parser_type text not null default 'auto' check (parser_type in ('auto', 'body')),
  active boolean not null default true,
  crawl_interval_minutes integer not null default 360 check (crawl_interval_minutes between 5 and 10080),
  last_fetched_at timestamptz,
  last_status text not null default 'pending' check (last_status in ('ok', 'blocked', 'failed', 'pending')),
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, url)
);

create table if not exists public.crawl_runs (
  id text primary key default gen_random_uuid()::text,
  source_id text references public.bbs_sources(id) on delete set null,
  store_id text not null references public.stores(id) on delete cascade,
  url text not null,
  status text not null check (status in ('ok', 'blocked', 'failed', 'pending')),
  message text,
  fetched_at timestamptz not null default now(),
  post_id text references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bbs_snapshots (
  id text primary key default gen_random_uuid()::text,
  source_id text references public.bbs_sources(id) on delete set null,
  store_id text not null references public.stores(id) on delete cascade,
  url text not null,
  screenshot_data_url text,
  extracted_text text not null default '',
  metrics jsonb not null default '{}',
  radar_score integer not null default 0 check (radar_score between 0 and 100),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists bbs_snapshots_store_captured_idx on public.bbs_snapshots (store_id, captured_at desc);

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

create index if not exists bbs_normalized_posts_store_observed_idx on public.bbs_normalized_posts (store_id, observed_at desc);
create index if not exists bbs_normalized_posts_store_posted_idx on public.bbs_normalized_posts (store_id, posted_at desc);

create table if not exists public.exact_terms (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  term_group text not null check (term_group in ('popularSingleMale', 'popularSingleFemale', 'negativePerson')),
  term text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, term_group, term)
);

create table if not exists public.word_bookmarks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  pattern text not null,
  match_type text not null default 'exact' check (match_type in ('exact', 'regex', 'emoji')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pattern, match_type)
);

create table if not exists public.user_store_decisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id text not null references public.stores(id) on delete cascade,
  decision text not null check (decision in ('candidate', 'favorite', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create table if not exists public.exact_matches (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  term_id text references public.exact_terms(id) on delete cascade,
  post_id text not null references public.posts(id) on delete cascade,
  store_id text not null references public.stores(id) on delete cascade,
  term_group text not null,
  term text not null,
  snippet text not null,
  matched_at timestamptz not null default now(),
  unique (user_id, term_group, term, post_id)
);

create table if not exists public.ai_analyses (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id text references public.posts(id) on delete set null,
  source_text text not null,
  result jsonb not null,
  mode text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.score_snapshots (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text references public.events(id) on delete set null,
  score integer not null,
  rank integer not null,
  tone text not null,
  metrics jsonb not null,
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id text primary key default gen_random_uuid()::text,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('stores', 'events', 'posts')),
  imported_count integer not null default 0,
  error_count integer not null default 0,
  errors text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.notification_jobs (
  id text primary key default gen_random_uuid()::text,
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  channel text not null check (channel in ('in_app', 'email', 'webhook')),
  audience text not null default 'free' check (audience in ('free', 'light', 'standard', 'premium')),
  scheduled_for timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'sent', 'dry_run', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  webhook_url text,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'webhook')),
  audience text not null default 'free' check (audience in ('free', 'light', 'standard', 'premium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stores enable row level security;
alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.store_situations enable row level security;
alter table public.bbs_sources enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.bbs_snapshots enable row level security;
alter table public.bbs_normalized_posts enable row level security;
alter table public.exact_terms enable row level security;
alter table public.exact_matches enable row level security;
alter table public.word_bookmarks enable row level security;
alter table public.user_store_decisions enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.score_snapshots enable row level security;
alter table public.import_batches enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists "profiles owner read" on public.profiles;
create policy "profiles owner read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "subscriptions owner read" on public.subscriptions;
create policy "subscriptions owner read" on public.subscriptions
  for select using (auth.uid() = user_id);

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

drop policy if exists "bbs normalized posts authenticated read" on public.bbs_normalized_posts;
create policy "bbs normalized posts authenticated read" on public.bbs_normalized_posts
  for select to authenticated using (true);

drop policy if exists "exact terms owner manage" on public.exact_terms;
create policy "exact terms owner manage" on public.exact_terms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "word bookmarks owner manage" on public.word_bookmarks;
create policy "word bookmarks owner manage" on public.word_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "store decisions owner manage" on public.user_store_decisions;
create policy "store decisions owner manage" on public.user_store_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "exact matches owner manage" on public.exact_matches;
create policy "exact matches owner manage" on public.exact_matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai analyses owner manage" on public.ai_analyses;
create policy "ai analyses owner manage" on public.ai_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "score snapshots owner manage" on public.score_snapshots;
create policy "score snapshots owner manage" on public.score_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "import batches owner manage" on public.import_batches;
create policy "import batches owner manage" on public.import_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notification owner manage" on public.notification_jobs;
create policy "notification owner manage" on public.notification_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notification prefs owner manage" on public.notification_preferences;
create policy "notification prefs owner manage" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists stores_updated_at on public.stores;
create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists store_situations_updated_at on public.store_situations;
create trigger store_situations_updated_at before update on public.store_situations
  for each row execute function public.set_updated_at();

drop trigger if exists bbs_sources_updated_at on public.bbs_sources;
create trigger bbs_sources_updated_at before update on public.bbs_sources
  for each row execute function public.set_updated_at();

drop trigger if exists exact_terms_updated_at on public.exact_terms;
create trigger exact_terms_updated_at before update on public.exact_terms
  for each row execute function public.set_updated_at();

drop trigger if exists notification_jobs_updated_at on public.notification_jobs;
create trigger notification_jobs_updated_at before update on public.notification_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

drop trigger if exists word_bookmarks_updated_at on public.word_bookmarks;
create trigger word_bookmarks_updated_at before update on public.word_bookmarks
  for each row execute function public.set_updated_at();

drop trigger if exists user_store_decisions_updated_at on public.user_store_decisions;
create trigger user_store_decisions_updated_at before update on public.user_store_decisions
  for each row execute function public.set_updated_at();
