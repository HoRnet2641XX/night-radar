alter table public.x_auto_posts
  drop constraint if exists x_auto_posts_post_kind_check;

alter table public.x_auto_posts
  add constraint x_auto_posts_post_kind_check
  check (post_kind in ('daily_ranking', 'today_ranking', 'weekly_momentum', 'tomorrow_forecast'));
