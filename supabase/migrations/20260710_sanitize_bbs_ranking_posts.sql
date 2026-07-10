update public.bbs_normalized_posts
set posted_at = null
where posted_at is not null
  and posted_at > observed_at + interval '10 minutes';

delete from public.bbs_normalized_posts
where lower(trim(author_name)) in (
  'staff',
  'スタッフ',
  '管理人',
  '管理者',
  '運営',
  '公式',
  '店長',
  'オーナー',
  'マスター',
  '受付',
  '事務局'
)
or (
  body ~* '(書き込みありがとうございます|予告メッセージありがとうございます|ご来店をスタッフ一同楽しみに|thank you for posting your visit notice|look forward to welcoming)'
  and (
    lower(regexp_replace(author_name, '[^[:alnum:]]', '', 'g')) in (
      'agreeable',
      'arabesque',
      'bdash',
      'bar440',
      '440',
      'barcanelo',
      'barface',
      'barrusk',
      'barspear',
      'campobar',
      'colorsbar',
      'filt',
      'filtshibuya',
      'honeytrap',
      'retreat',
      'retreatbar',
      'voluptuous'
    )
    or body ~* '(^|投稿者[:：][[:space:]]*)(retreat[[:space:]]*bar|campo[[:space:]]*bar|b-?dash|voluptuous|agreeable|arabesque|bar[[:space:]]*440|bar[[:space:]]*canelo|bar[[:space:]]*face|bar[[:space:]]*rusk|bar[[:space:]]*spear|colors[[:space:]]*bar|honey[[:space:]]*trap)'
  )
)
or (
  (
    (store_id = 'b-dash' and lower(regexp_replace(author_name, '[^[:alnum:]]', '', 'g')) = 'bdash')
    or (store_id = 'voluptuous' and lower(regexp_replace(author_name, '[^[:alnum:]]', '', 'g')) = 'voluptuous')
  )
  and body ~* '(本日.{0,40}(昼|夜).{0,12}部|営業時間|イベント(開催|情報|のお知らせ)|当店からのお知らせ|ようこそ.{0,40}へ)'
);
