-- Replace generic seed values only where the public store location is known.
update public.stores as store
set area = verified.area
from (
  values
    ('agreeable', '新宿'),
    ('arabesque', '新宿'),
    ('b-dash', '池袋'),
    ('bar-canelo', '五反田'),
    ('bar-face', '六本木・西麻布'),
    ('bar-rusk', '上野・御徒町'),
    ('bar-spear', '五反田'),
    ('bar440', '新宿・歌舞伎町'),
    ('campo-bar', '錦糸町'),
    ('club-scarlet-tokyo', '新宿'),
    ('collabo', '秋葉原'),
    ('colors-bar', '新宿'),
    ('filt-shibuya', '渋谷'),
    ('harnes-tokyo', '上野'),
    ('honey-trap', '上野'),
    ('land-land', '聖蹟桜ヶ丘'),
    ('ogikubo-himitsu-club', '荻窪'),
    ('papillon', '上野'),
    ('retreat-bar', '新宿'),
    ('secret-bar-silent-moon', '渋谷'),
    ('voluptuous', '新宿')
) as verified(id, area)
where store.id = verified.id
  and coalesce(store.area, '') in ('', '未設定', '都内', '東京');
