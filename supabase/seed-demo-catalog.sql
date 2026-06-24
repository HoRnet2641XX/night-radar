insert into public.stores (
  id,
  owner_id,
  name,
  area,
  has_daytime,
  has_night,
  opening_hour_day,
  opening_hour_night,
  pr_structure,
  strong_days,
  strong_events,
  weak_events,
  trust_seed
) values
  ('retreat-bar', null, 'RETREAT BAR', '都内', true, true, '13:00', '19:00', '公式イベント観測', array['火曜','金曜'], array['昼主婦系','初心者系'], array['SM系'], 78),
  ('colors-bar', null, 'COLORS BAR', '都内', false, true, '', '19:00', 'BBS観測', array['金曜','土曜'], array['カップル系','女性無料系'], array['初心者系'], 74),
  ('bar-face', null, 'BAR FACE', '都内', true, false, '13:00', '', '昼営業観測', array['日曜'], array['昼主婦系','平日穴場系'], array['女性無料系'], 69),
  ('bar-spear', null, 'BAR SPEAR', '都内', false, true, '', '20:00', '公式イベント観測', array['水曜'], array['SM系','初心者系'], array['昼主婦系'], 66)
on conflict (id) do update set
  owner_id = excluded.owner_id,
  name = excluded.name,
  area = excluded.area,
  has_daytime = excluded.has_daytime,
  has_night = excluded.has_night,
  opening_hour_day = excluded.opening_hour_day,
  opening_hour_night = excluded.opening_hour_night,
  pr_structure = excluded.pr_structure,
  strong_days = excluded.strong_days,
  strong_events = excluded.strong_events,
  weak_events = excluded.weak_events,
  trust_seed = excluded.trust_seed;

insert into public.events (
  id,
  store_id,
  date_label,
  weekday,
  starts_at,
  session,
  category,
  title,
  source_url
) values
  ('ev-1', 'retreat-bar', '今日', '火曜', '13:00', 'day', '昼主婦系', '昼主婦系イベント', null),
  ('ev-2', 'colors-bar', '今日', '火曜', '19:00', 'night', '女性無料系', '女性無料イベント', null),
  ('ev-3', 'bar-face', '明日', '水曜', '13:00', 'day', '初心者系', '初心者デー', null),
  ('ev-4', 'bar-spear', '明日', '水曜', '19:00', 'night', 'SM系', '嗜好イベント', null),
  ('ev-5', 'retreat-bar', '金曜', '金曜', '19:00', 'night', '初心者系', '初心者イベント', null)
on conflict (id) do update set
  store_id = excluded.store_id,
  date_label = excluded.date_label,
  weekday = excluded.weekday,
  starts_at = excluded.starts_at,
  session = excluded.session,
  category = excluded.category,
  title = excluded.title,
  source_url = excluded.source_url;

insert into public.posts (
  id,
  store_id,
  source,
  source_url,
  posted_at,
  body,
  body_hash,
  keywords
) values
  ('post-1', 'retreat-bar', 'manual', null, now() - interval '2 hours', '本日13時から昼イベント。昼、主婦、初参加ワードが強め。人気単女Bの書き込みあり。時間帯と人数感が具体的。', encode(digest('本日13時から昼イベント。昼、主婦、初参加ワードが強め。人気単女Bの書き込みあり。時間帯と人数感が具体的。', 'sha256'), 'hex'), array['昼','主婦','初参加','人気単女B']),
  ('post-2', 'colors-bar', 'manual', null, now() - interval '1 day', '19時前後に女性無料イベントの告知が増加。カップル、女性予約の言及あり。人気単男Aが反応。', encode(digest('19時前後に女性無料イベントの告知が増加。カップル、女性予約の言及あり。人気単男Aが反応。', 'sha256'), 'hex'), array['女性無料','カップル','女性予約','人気単男A']),
  ('post-3', 'bar-spear', 'manual', null, now() - interval '2 days', '水曜夜のSM系イベント告知。嗜好ワードは強いが、人数や時間の具体性は控えめ。苦手さんCの話題もあり要確認。', encode(digest('水曜夜のSM系イベント告知。嗜好ワードは強いが、人数や時間の具体性は控えめ。苦手さんCの話題もあり要確認。', 'sha256'), 'hex'), array['SM','M','S']),
  ('post-4', 'retreat-bar', 'manual', null, now() - interval '3 days', '火曜夜は初参加と女性予約の書き込みが多い。人気単男A、人気単女Bの完全一致ワードが同じスレッドに出現。', encode(digest('火曜夜は初参加と女性予約の書き込みが多い。人気単男A、人気単女Bの完全一致ワードが同じスレッドに出現。', 'sha256'), 'hex'), array['初参加','女性予約','人気単男A','人気単女B'])
on conflict (id) do update set
  store_id = excluded.store_id,
  source = excluded.source,
  source_url = excluded.source_url,
  posted_at = excluded.posted_at,
  body = excluded.body,
  body_hash = excluded.body_hash,
  keywords = excluded.keywords;

insert into public.store_situations (
  id,
  store_id,
  status,
  title,
  note,
  source_url,
  observed_at
) values
  ('sit-1', 'retreat-bar', 'event', '火曜昼イベント継続', '昼主婦系と初参加ワードが直近投稿で重なっている。昼枠は引き続き観測対象。', null, now() - interval '2 hours'),
  ('sit-2', 'colors-bar', 'crowded', '女性無料告知が増加', '夜帯の書き込み比率が高い。カップル、女性予約の完全一致ワードを継続監視。', null, now() - interval '1 day')
on conflict (id) do update set
  store_id = excluded.store_id,
  status = excluded.status,
  title = excluded.title,
  note = excluded.note,
  source_url = excluded.source_url,
  observed_at = excluded.observed_at;
