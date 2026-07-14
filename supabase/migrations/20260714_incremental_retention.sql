-- Keep scheduled maintenance below the Supabase/PostgREST statement timeout.
-- Recent rows are recalculated, while expired rows are rolled up and removed in
-- bounded batches so a large existing history does not block the audit job.

create index if not exists bbs_snapshots_captured_idx
  on public.bbs_snapshots (captured_at);

create index if not exists crawl_runs_fetched_idx
  on public.crawl_runs (fetched_at);

create index if not exists bbs_normalized_posts_observed_idx
  on public.bbs_normalized_posts (observed_at);

-- Reconcile every raw row that is still retained. This is intentionally outside
-- the recurring function: it repairs the initial rollup backlog once without
-- making every audit rescan the full history.
insert into public.store_daily_rollups (
  store_id, date_key, post_count, unique_author_count, female_post_count, male_post_count, updated_at
)
select
  store_id,
  (coalesce(posted_at, observed_at) at time zone 'Asia/Tokyo')::date,
  count(*)::integer,
  count(distinct nullif(lower(trim(author_name)), '記載なし'))::integer,
  count(*) filter (where author_gender in ('女性', '女', '単女', '単独女性', '♀'))::integer,
  count(*) filter (where author_gender in ('男性', '男', '単男', '単独男性', '♂'))::integer,
  now()
from public.bbs_normalized_posts
group by store_id, (coalesce(posted_at, observed_at) at time zone 'Asia/Tokyo')::date
on conflict (store_id, date_key) do update set
  post_count = excluded.post_count,
  unique_author_count = excluded.unique_author_count,
  female_post_count = excluded.female_post_count,
  male_post_count = excluded.male_post_count,
  updated_at = now();

insert into public.store_hourly_rollups (
  store_id, hour_start, snapshot_count, average_radar_score, updated_at
)
select store_id, date_trunc('hour', captured_at), count(*)::integer, avg(radar_score), now()
from public.bbs_snapshots
group by store_id, date_trunc('hour', captured_at)
on conflict (store_id, hour_start) do update set
  snapshot_count = excluded.snapshot_count,
  average_radar_score = excluded.average_radar_score,
  updated_at = now();

insert into public.store_hourly_rollups (
  store_id, hour_start, crawl_count, successful_crawl_count, blocked_crawl_count, failed_crawl_count, updated_at
)
select
  store_id,
  date_trunc('hour', fetched_at),
  count(*)::integer,
  count(*) filter (where status = 'ok')::integer,
  count(*) filter (where status = 'blocked')::integer,
  count(*) filter (where status = 'failed')::integer,
  now()
from public.crawl_runs
group by store_id, date_trunc('hour', fetched_at)
on conflict (store_id, hour_start) do update set
  crawl_count = excluded.crawl_count,
  successful_crawl_count = excluded.successful_crawl_count,
  blocked_crawl_count = excluded.blocked_crawl_count,
  failed_crawl_count = excluded.failed_crawl_count,
  updated_at = now();

create or replace function public.run_night_radar_retention(
  snapshot_retention_days integer default 14,
  crawl_retention_days integer default 30,
  normalized_post_retention_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_snapshots integer := 0;
  deleted_crawls integer := 0;
  deleted_posts integer := 0;
  deleted_alerts integer := 0;
  maintenance_batch_size constant integer := 2000;
begin
  -- Recalculate complete date groups touched by a recent observation. Filtering
  -- the aggregate itself would overwrite the first date with a partial day.
  with touched as materialized (
    select distinct
      store_id,
      (coalesce(posted_at, observed_at) at time zone 'Asia/Tokyo')::date as date_key
    from public.bbs_normalized_posts
    where observed_at >= now() - interval '3 days'
  ), aggregated as materialized (
    select
      source.store_id,
      (coalesce(source.posted_at, source.observed_at) at time zone 'Asia/Tokyo')::date as date_key,
      count(*)::integer as post_count,
      count(distinct nullif(lower(trim(source.author_name)), '記載なし'))::integer as unique_author_count,
      count(*) filter (where source.author_gender in ('女性', '女', '単女', '単独女性', '♀'))::integer as female_post_count,
      count(*) filter (where source.author_gender in ('男性', '男', '単男', '単独男性', '♂'))::integer as male_post_count
    from public.bbs_normalized_posts source
    join touched
      on touched.store_id = source.store_id
      and touched.date_key = (coalesce(source.posted_at, source.observed_at) at time zone 'Asia/Tokyo')::date
    group by source.store_id, (coalesce(source.posted_at, source.observed_at) at time zone 'Asia/Tokyo')::date
  )
  insert into public.store_daily_rollups (
    store_id, date_key, post_count, unique_author_count, female_post_count, male_post_count, updated_at
  )
  select store_id, date_key, post_count, unique_author_count, female_post_count, male_post_count, now()
  from aggregated
  on conflict (store_id, date_key) do update set
    post_count = excluded.post_count,
    unique_author_count = excluded.unique_author_count,
    female_post_count = excluded.female_post_count,
    male_post_count = excluded.male_post_count,
    updated_at = now();

  -- Recalculate complete hours touched by the recent operational window.
  with touched as materialized (
    select distinct store_id, date_trunc('hour', captured_at) as hour_start
    from public.bbs_snapshots
    where captured_at >= now() - interval '48 hours'
  ), aggregated as materialized (
    select
      source.store_id,
      date_trunc('hour', source.captured_at) as hour_start,
      count(*)::integer as snapshot_count,
      avg(source.radar_score) as average_radar_score
    from public.bbs_snapshots source
    join touched
      on touched.store_id = source.store_id
      and touched.hour_start = date_trunc('hour', source.captured_at)
    group by source.store_id, date_trunc('hour', source.captured_at)
  )
  insert into public.store_hourly_rollups (
    store_id, hour_start, snapshot_count, average_radar_score, updated_at
  )
  select store_id, hour_start, snapshot_count, average_radar_score, now()
  from aggregated
  on conflict (store_id, hour_start) do update set
    snapshot_count = excluded.snapshot_count,
    average_radar_score = excluded.average_radar_score,
    updated_at = now();

  with touched as materialized (
    select distinct store_id, date_trunc('hour', fetched_at) as hour_start
    from public.crawl_runs
    where fetched_at >= now() - interval '48 hours'
  ), aggregated as materialized (
    select
      source.store_id,
      date_trunc('hour', source.fetched_at) as hour_start,
      count(*)::integer as crawl_count,
      count(*) filter (where source.status = 'ok')::integer as successful_crawl_count,
      count(*) filter (where source.status = 'blocked')::integer as blocked_crawl_count,
      count(*) filter (where source.status = 'failed')::integer as failed_crawl_count
    from public.crawl_runs source
    join touched
      on touched.store_id = source.store_id
      and touched.hour_start = date_trunc('hour', source.fetched_at)
    group by source.store_id, date_trunc('hour', source.fetched_at)
  )
  insert into public.store_hourly_rollups (
    store_id, hour_start, crawl_count, successful_crawl_count, blocked_crawl_count, failed_crawl_count, updated_at
  )
  select store_id, hour_start, crawl_count, successful_crawl_count, blocked_crawl_count, failed_crawl_count, now()
  from aggregated
  on conflict (store_id, hour_start) do update set
    crawl_count = excluded.crawl_count,
    successful_crawl_count = excluded.successful_crawl_count,
    blocked_crawl_count = excluded.blocked_crawl_count,
    failed_crawl_count = excluded.failed_crawl_count,
    updated_at = now();

  -- Preserve expired snapshot history before deleting at most one bounded batch.
  with expired as materialized (
    select id, store_id, captured_at, radar_score
    from public.bbs_snapshots
    where captured_at < now() - make_interval(days => greatest(7, snapshot_retention_days))
    order by captured_at
    limit maintenance_batch_size
  ), touched as materialized (
    select distinct store_id, date_trunc('hour', captured_at) as hour_start
    from expired
  ), aggregated as materialized (
    select
      source.store_id,
      date_trunc('hour', source.captured_at) as hour_start,
      count(*)::integer as snapshot_count,
      avg(source.radar_score) as average_radar_score
    from public.bbs_snapshots source
    join touched
      on touched.store_id = source.store_id
      and touched.hour_start = date_trunc('hour', source.captured_at)
    group by source.store_id, date_trunc('hour', source.captured_at)
  ), rolled_up as (
    insert into public.store_hourly_rollups (
      store_id, hour_start, snapshot_count, average_radar_score, updated_at
    )
    select store_id, hour_start, snapshot_count, average_radar_score, now()
    from aggregated
    on conflict (store_id, hour_start) do update set
      average_radar_score = case
        when excluded.snapshot_count >= public.store_hourly_rollups.snapshot_count
          then excluded.average_radar_score
        else public.store_hourly_rollups.average_radar_score
      end,
      snapshot_count = greatest(public.store_hourly_rollups.snapshot_count, excluded.snapshot_count),
      updated_at = now()
    returning store_id, hour_start
  ), removed as (
    delete from public.bbs_snapshots target
    using expired
    where target.id = expired.id
      and exists (select 1 from rolled_up)
    returning 1
  )
  select count(*)::integer into deleted_snapshots from removed;

  -- Preserve expired crawl outcomes before deleting one bounded batch.
  with expired as materialized (
    select id, store_id, fetched_at, status
    from public.crawl_runs
    where fetched_at < now() - make_interval(days => greatest(14, crawl_retention_days))
    order by fetched_at
    limit maintenance_batch_size
  ), touched as materialized (
    select distinct store_id, date_trunc('hour', fetched_at) as hour_start
    from expired
  ), aggregated as materialized (
    select
      source.store_id,
      date_trunc('hour', source.fetched_at) as hour_start,
      count(*)::integer as crawl_count,
      count(*) filter (where source.status = 'ok')::integer as successful_crawl_count,
      count(*) filter (where source.status = 'blocked')::integer as blocked_crawl_count,
      count(*) filter (where source.status = 'failed')::integer as failed_crawl_count
    from public.crawl_runs source
    join touched
      on touched.store_id = source.store_id
      and touched.hour_start = date_trunc('hour', source.fetched_at)
    group by source.store_id, date_trunc('hour', source.fetched_at)
  ), rolled_up as (
    insert into public.store_hourly_rollups (
      store_id, hour_start, crawl_count, successful_crawl_count, blocked_crawl_count, failed_crawl_count, updated_at
    )
    select
      store_id,
      hour_start,
      crawl_count,
      successful_crawl_count,
      blocked_crawl_count,
      failed_crawl_count,
      now()
    from aggregated
    on conflict (store_id, hour_start) do update set
      crawl_count = greatest(public.store_hourly_rollups.crawl_count, excluded.crawl_count),
      successful_crawl_count = greatest(public.store_hourly_rollups.successful_crawl_count, excluded.successful_crawl_count),
      blocked_crawl_count = greatest(public.store_hourly_rollups.blocked_crawl_count, excluded.blocked_crawl_count),
      failed_crawl_count = greatest(public.store_hourly_rollups.failed_crawl_count, excluded.failed_crawl_count),
      updated_at = now()
    returning store_id, hour_start
  ), removed as (
    delete from public.crawl_runs target
    using expired
    where target.id = expired.id
      and exists (select 1 from rolled_up)
    returning 1
  )
  select count(*)::integer into deleted_crawls from removed;

  -- Raw normalized posts have the longest retention. Roll up each expired batch
  -- before removal so long-term daily trends remain available.
  with expired as materialized (
    select id, store_id, author_name, author_gender, posted_at, observed_at
    from public.bbs_normalized_posts
    where observed_at < now() - make_interval(days => greatest(30, normalized_post_retention_days))
    order by observed_at
    limit maintenance_batch_size
  ), touched as materialized (
    select distinct
      store_id,
      (coalesce(posted_at, observed_at) at time zone 'Asia/Tokyo')::date as date_key
    from expired
  ), aggregated as materialized (
    select
      source.store_id,
      (coalesce(source.posted_at, source.observed_at) at time zone 'Asia/Tokyo')::date as date_key,
      count(*)::integer as post_count,
      count(distinct nullif(lower(trim(source.author_name)), '記載なし'))::integer as unique_author_count,
      count(*) filter (where source.author_gender in ('女性', '女', '単女', '単独女性', '♀'))::integer as female_post_count,
      count(*) filter (where source.author_gender in ('男性', '男', '単男', '単独男性', '♂'))::integer as male_post_count
    from public.bbs_normalized_posts source
    join touched
      on touched.store_id = source.store_id
      and touched.date_key = (coalesce(source.posted_at, source.observed_at) at time zone 'Asia/Tokyo')::date
    group by source.store_id, (coalesce(source.posted_at, source.observed_at) at time zone 'Asia/Tokyo')::date
  ), rolled_up as (
    insert into public.store_daily_rollups (
      store_id, date_key, post_count, unique_author_count, female_post_count, male_post_count, updated_at
    )
    select
      store_id,
      date_key,
      post_count,
      unique_author_count,
      female_post_count,
      male_post_count,
      now()
    from aggregated
    on conflict (store_id, date_key) do update set
      post_count = greatest(public.store_daily_rollups.post_count, excluded.post_count),
      unique_author_count = greatest(public.store_daily_rollups.unique_author_count, excluded.unique_author_count),
      female_post_count = greatest(public.store_daily_rollups.female_post_count, excluded.female_post_count),
      male_post_count = greatest(public.store_daily_rollups.male_post_count, excluded.male_post_count),
      updated_at = now()
    returning store_id, date_key
  ), removed as (
    delete from public.bbs_normalized_posts target
    using expired
    where target.id = expired.id
      and exists (select 1 from rolled_up)
    returning 1
  )
  select count(*)::integer into deleted_posts from removed;

  with removed as (
    delete from public.operational_alerts
    where id in (
      select id
      from public.operational_alerts
      where created_at < now() - interval '90 days'
      order by created_at
      limit maintenance_batch_size
    )
    returning 1
  )
  select count(*)::integer into deleted_alerts from removed;

  return jsonb_build_object(
    'deletedSnapshots', deleted_snapshots,
    'deletedCrawlRuns', deleted_crawls,
    'deletedNormalizedPosts', deleted_posts,
    'deletedAlerts', deleted_alerts,
    'batchSize', maintenance_batch_size,
    'completedAt', now()
  );
end;
$$;

revoke all on function public.run_night_radar_retention(integer, integer, integer) from public;
grant execute on function public.run_night_radar_retention(integer, integer, integer) to service_role;
