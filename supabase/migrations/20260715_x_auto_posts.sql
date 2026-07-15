create table if not exists public.x_auto_posts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  post_kind text not null check (post_kind in ('daily_ranking', 'today_ranking', 'weekly_momentum', 'tomorrow_forecast')),
  scheduled_for timestamptz not null,
  content text not null,
  content_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'posted', 'failed')),
  x_post_id text,
  x_post_url text,
  source_generated_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  attempts integer not null default 1 check (attempts > 0),
  error_message text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists x_auto_posts_scheduled_idx on public.x_auto_posts (scheduled_for desc);
create index if not exists x_auto_posts_status_idx on public.x_auto_posts (status, created_at desc);

alter table public.x_auto_posts enable row level security;

drop trigger if exists x_auto_posts_updated_at on public.x_auto_posts;
create trigger x_auto_posts_updated_at before update on public.x_auto_posts
  for each row execute function public.set_updated_at();

revoke all on table public.x_auto_posts from anon, authenticated;
grant select, insert, update, delete on table public.x_auto_posts to service_role;
