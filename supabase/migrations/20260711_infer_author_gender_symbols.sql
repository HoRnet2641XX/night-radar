update public.bbs_normalized_posts
set author_gender = '女性'
where coalesce(author_gender, '記載なし') in ('', '記載なし')
  and author_name like '%♀%';

update public.bbs_normalized_posts
set author_gender = '男性'
where coalesce(author_gender, '記載なし') in ('', '記載なし')
  and author_name like '%♂%';
