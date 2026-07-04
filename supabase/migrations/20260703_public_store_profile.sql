begin;

alter table public.stores
  add column if not exists address text,
  add column if not exists nearest_station text,
  add column if not exists phone text,
  add column if not exists official_url text,
  add column if not exists map_url text,
  add column if not exists price_note text,
  add column if not exists tags text[] not null default '{}';

comment on column public.stores.address is '公開店舗詳細に表示する住所';
comment on column public.stores.nearest_station is '公開店舗詳細に表示する最寄り駅・エリア補足';
comment on column public.stores.phone is '店舗電話番号';
comment on column public.stores.official_url is '店舗公式サイトURL';
comment on column public.stores.map_url is '地図リンクURL';
comment on column public.stores.price_note is '公開店舗カードに表示する料金メモ';
comment on column public.stores.tags is '公開検索・条件絞り込みに使う店舗タグ';

commit;
