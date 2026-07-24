update public.events
set
  category = '抽選',
  details = case
    when details like '%抽選%' then details
    when details = '' then '23時から大抽選会を開催'
    else details || ' / 23時から大抽選会を開催'
  end,
  updated_at = now()
where id = 'retreat-bar-2026-07-25-19:00-2026-夏のbigイベント-夏フェス-開催';
