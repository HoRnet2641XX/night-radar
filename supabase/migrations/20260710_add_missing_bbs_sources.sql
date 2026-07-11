insert into public.bbs_sources (
  id,
  store_id,
  label,
  url,
  parser_type,
  active,
  crawl_interval_minutes,
  last_status
) values
  (
    'silent-moon-bbs',
    'secret-bar-silent-moon',
    'BBS',
    'https://www.silent-moon.net/jp/silentmoon-bbs.php',
    'auto',
    true,
    5,
    'pending'
  )
on conflict (store_id, url) do update set
  label = excluded.label,
  parser_type = excluded.parser_type,
  active = excluded.active,
  crawl_interval_minutes = excluded.crawl_interval_minutes,
  updated_at = now();

update public.bbs_sources
set
  url = 'https://rara.jp/zeus/',
  last_status = 'pending',
  last_message = '公式ページ内の現行BBSへ巡回先を更新しました。',
  updated_at = now()
where id = 'club-zeus-bbs';
