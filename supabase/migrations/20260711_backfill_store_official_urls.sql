update public.stores as store
set official_url = catalog.official_url
from (
  values
    ('agreeable', 'https://agreeable.bar/'),
    ('arabesque', 'https://arabesque.jpn.com/'),
    ('b-dash', 'https://b-dash.bar/'),
    ('bar-canelo', 'https://barcanelo.com/'),
    ('bar-face', 'https://bar-face.jp/'),
    ('bar-rusk', 'https://bar-rusk.com/'),
    ('bar-spear', 'https://www.barspear.com/'),
    ('bar440', 'https://bar440.jimdofree.com/'),
    ('campo-bar', 'https://campo-bar.com/'),
    ('club-scarlet-tokyo', 'https://scarlet.tokyo/'),
    ('club-zeus', 'http://sm-zeus.com/'),
    ('collabo', 'https://www.collabo7.com/'),
    ('colors-bar', 'https://t-colors.net/'),
    ('communicationbar-sango', 'https://bar-sango.com/'),
    ('filt-shibuya', 'https://filtshibuya.com/'),
    ('harnes-tokyo', 'https://harnes.tokyo/'),
    ('honey-trap', 'https://bar-honeytrap.com/'),
    ('land-land', 'https://land2021.com/'),
    ('mille-feuille', 'https://millefeuillesby.apage.jp/'),
    ('ogikubo-himitsu-club', 'https://ogikubo0620.com/'),
    ('papillon', 'https://bar-papillon.net/'),
    ('retreat-bar', 'https://retreatbar.jp/'),
    ('secret-bar-silent-moon', 'https://www.silent-moon.net/'),
    ('voluptuous', 'https://voluptuous.tokyo/')
) as catalog(id, official_url)
where store.id = catalog.id
  and coalesce(trim(store.official_url), '') = '';

update public.stores
set area = '東京'
where id = 'club-scarlet-tokyo'
  and coalesce(trim(area), '') in ('', '未設定');
