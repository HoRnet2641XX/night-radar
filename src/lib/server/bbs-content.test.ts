import assert from 'node:assert/strict'
import test from 'node:test'
import { extractNormalizedBbsPostsFromText } from '../scoring'
import {
  extractBbsPageContent,
  extractApageReaderContent,
  extractHarnesCurrentCalendarPostId,
  extractHarnesPopupComments,
  extractNeoReaderContent,
  extractScarletCommentsPayload,
} from './bbs-content'
import { buildBbsSnapshot } from './bbs-snapshot'

test('extracts the current HARNES popup id and canonical customer comments', () => {
  const calendar = `<table><td class="jet-calendar-week__day current-day"><div class="jet-calendar-week__day-event" data-post-id="1837"></div></td></table>`
  const popup = `<div class="jet-listing-grid__item" data-post-id="21853">
    <style>.ignored{display:none}</style>
    🌃 2026.07.12 14:44 投稿者: T (女性) 行きたいです
  </div><div class="jet-listing-grid__item" data-post-id="21854">
    夜 2026.07.12 18:31 投稿者: くま (男性) 久しぶりに伺います
  </div>`

  assert.equal(extractHarnesCurrentCalendarPostId(calendar), '1837')
  const posts = extractNormalizedBbsPostsFromText(extractHarnesPopupComments(popup), '2026-07-12T10:00:00.000Z')
  assert.equal(posts.length, 2)
  assert.equal(posts[0].articleNo, '21853')
  assert.equal(posts[0].authorName, 'T')
  assert.equal(posts[0].authorGender, '女性')
  assert.equal(posts[0].postedAt, '2026-07-12T05:44:00.000Z')
  assert.equal(posts[1].authorName, 'くま')
})

test('normalizes WordPress comments into dated customer posts', () => {
  const page = extractBbsPageContent(
    `<html><head><title>Topics</title></head><body>
      <div class="comment-body" id="comment-101">
        <div class="comment-author">R1 より:</div>
        <div class="comment-meta">2026年7月10日 05:57:05</div>
        <p>仕事が早く終われば夜の部に行きます。</p><div class="reply">返信</div>
      </div>
    </body></html>`,
    'https://example.com/topics/100/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T00:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].authorName, 'R1')
  assert.equal(posts[0].postedAt, '2026-07-09T20:57:00.000Z')
  assert.match(posts[0].body, /夜の部に行きます/)
})

test('normalizes bbPress replies with AM and PM dates', () => {
  const page = extractBbsPageContent(
    `<html><body><div class="bbp-reply-header">
      <span class="bbp-reply-post-date">2026年5月15日 1:25 PM</span><a>#8999</a>
    </div><div class="reply post-8999">
      <div class="bbp-reply-author"><span class="bbp-author-name">よし（♂）ゲスト</span></div>
      <div class="bbp-reply-content"><p>後ほど行きます</p></div>
    </div></body></html>`,
    'https://example.com/forums/topic/today/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-05-15T05:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '8999')
  assert.equal(posts[0].authorName, 'よし')
  assert.equal(posts[0].authorGender, '男性')
  assert.equal(posts[0].postedAt, '2026-05-15T04:25:00.000Z')
})

test('normalizes bbPress month-first dates', () => {
  const page = extractBbsPageContent(
    `<html><body><div class="bbp-reply-header">
      <span class="bbp-reply-post-date">7月 10, 2026 9:53 am</span><a>#74955</a>
    </div><div class="reply post-74955">
      <div class="bbp-reply-author"><span class="bbp-author-name">Mi♂</span></div>
      <div class="bbp-reply-content"><p>17時頃行きます</p></div>
    </div></body></html>`,
    'https://example.com/bbs/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T01:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].postedAt, '2026-07-10T00:53:00.000Z')
})

test('normalizes inline author and date replies', () => {
  const page = extractBbsPageContent(
    `<html><body><article>
      投稿者：N（女性） 2026/07/07(火) 00:09 初めてです。ふたりで行きます。 返信 編集・削除
    </article></body></html>`,
    'https://example.com/bbs/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-07T00:10:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].authorName, 'N')
  assert.equal(posts[0].authorGender, '女性')
  assert.equal(posts[0].postedAt, '2026-07-06T15:09:00.000Z')
})

test('normalizes message cards with separate author metadata', () => {
  const page = extractBbsPageContent(
    `<html><body><div class="main-comment" id="message41298">
      <p class="message">初めてです。本日19時から伺います。</p>
      <p class="name"><span class="user_name">みく</span><span class="sex">女性</span><span>2026-07-10 09:12:48</span></p>
    </div></body></html>`,
    'https://example.com/message',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T01:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '41298')
  assert.equal(posts[0].authorName, 'みく')
  assert.equal(posts[0].authorGender, '女性')
  assert.equal(posts[0].postedAt, '2026-07-10T00:12:00.000Z')
})

test('normalizes Papillon cards from direct body and gender image', () => {
  const page = extractBbsPageContent(
    `<html><body><div class="main-comment message" id="message77672">
      <p>夜遅くに伺います。</p>
      <div class="name"><span class="user_name">櫻井</span><img src="/images/sex/man.png"><span>2026-07-11 17:24:16</span><a data-id="77672">編集</a></div>
      <div class="reply-comment message"><p>お待ちしています。</p></div>
    </div></body></html>`,
    'https://bar-papillon.net/message',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-11T09:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '77672')
  assert.equal(posts[0].authorName, '櫻井')
  assert.equal(posts[0].authorGender, '男性')
  assert.equal(posts[0].body, '夜遅くに伺います。')
})

test('normalizes Sango customer cards without edit forms or staff replies', () => {
  const page = extractBbsPageContent(
    `<html><body><article class="bbs-post" id="post-4158" data-post-id="4158">
      <span class="post-author">投稿者: つる <span class="gender-icon gender-icon-male" aria-label="男"></span></span>
      <span class="post-date">2026年07月11日 18:00</span>
      <div class="post-content"><p>初めて伺います。よろしくお願いいたします。</p></div>
      <form class="bbs-edit-form"><label>パスワードを入力</label></form>
      <div class="bbs-reply"><span class="post-author">投稿者: 珊瑚</span><p>お待ちしています。</p></div>
    </article></body></html>`,
    'https://bar-sango.com/bbs/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-11T09:10:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '4158')
  assert.equal(posts[0].authorName, 'つる')
  assert.equal(posts[0].authorGender, '男性')
  assert.equal(posts[0].body, '初めて伺います。よろしくお願いいたします。')
})

test('normalizes Neo reader threads into stable customer posts with target dates', () => {
  const text = [
    'Neo さん (9ei1b31j)NEW 2026/7/10 15:33 (No.154242)削除 Neo 7/11(土) 営業時間 昼の部：12:00-18:00 夜の部：18:00-05:00',
    'し しらたま さん (9woghdlq)NEW 2026/7/10 17:08 削除 お昼から行きます！',
    'ゆ ゆ♀さん (9yw8exs1)2026/7/11 09:06 削除 夕方に伺います🍻 返信',
    'Neo さん (9ei1b31j)2026/7/11 00:13 (No.154362)削除 7/12(日)Neo 営業時間 12:00-20:00',
    'デ デカ さん (9h5mralq)2026/7/11 05:49 削除 日曜日遊びいきます 返信',
  ].join(' ')
  const normalized = extractNormalizedBbsPostsFromText(extractNeoReaderContent(text), '2026-07-11T09:10:00.000Z')

  assert.equal(normalized.length, 3)
  assert.equal(normalized[0].authorName, 'しらたま')
  assert.equal(normalized[0].articleNo, 'neo-9woghdlq-20267101708')
  assert.match(normalized[0].body, /^\[\[NR_TARGET_DATE:2026-07-11\]\]/)
  assert.equal(normalized[1].authorGender, '女性')
  assert.match(normalized[2].body, /^\[\[NR_TARGET_DATE:2026-07-12\]\]/)
})

test('normalizes APAGE parent posts without mixing staff replies into customers', () => {
  const text = [
    'レ レイ さん (9wbul98n)2026/7/16 18:58 (No.1650451)削除 スタッフのレイです！ 19:00から出勤します。今夜も皆様のご来店お待ちしてます♪ 返信',
    'え えま さん (9znqkl6d)2026/7/15 23:08 (No.1650209)削除 いまからいきます',
    'レ レイ さん (9wbul98n)2026/7/15 23:14 削除 えまさん いらっしゃいませ♡ 返信',
    'ま まり さん (9uz71td2)2026/7/15 18:49 (No.1650112)削除 ちょっとだけお邪魔しますー！',
    'レ レイ さん (9wbul98n)2026/7/15 18:53 削除 まりちゃん お待ちしてます♪ 返信',
  ].join(' ')
  const normalized = extractNormalizedBbsPostsFromText(extractApageReaderContent(text), '2026-07-16T10:00:00.000Z')

  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].articleNo, '1650209')
  assert.equal(normalized[0].authorName, 'えま')
  assert.equal(normalized[0].body, 'いまからいきます')
  assert.equal(normalized[1].articleNo, '1650112')
  assert.equal(normalized[1].authorName, 'まり')
  assert.doesNotMatch(normalized.map((post) => post.body).join(' '), /スタッフ|いらっしゃいませ|お待ちしてます/)
})

test('normalizes dated article cards', () => {
  const page = extractBbsPageContent(
    `<html><body><main>新規です。 2026/07/09 10:58:08 ［記事No：10013］投稿者：ゆーすけ 男性
      本日仕事終わりに初めて来店します。返信する</main></body></html>`,
    'https://example.com/bbs/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T01:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '10013')
  assert.equal(posts[0].authorName, 'ゆーすけ')
  assert.equal(posts[0].authorGender, '男性')
  assert.equal(posts[0].postedAt, '2026-07-09T01:58:00.000Z')
})

test('normalizes legacy contributor boards without mixing body text into the author', () => {
  const page = extractBbsPageContent(
    `<html><body><dl class="block_all">
      <dt class="title">明日12日</dt>
      <dd><dl class="contributor">
        <dt class="name_block"><span class="name_text">投稿者：</span><span class="name">たんたん🍥</span><span class="sex"></span></dt>
        <dl><div class="text">今から行きます！</div><div class="time_block">
          <span class="date_text">投稿日：</span><span class="date">2026/07/11(Sat) 23:33:09</span>
          <span class="number_text">記事番号：</span><span class="number">2445</span>
        </div></dl>
      </dl></dd>
      <dt class="title">Re: 明日12日</dt>
      <dd><dl class="contributor">
        <dt class="name_block"><span class="name_text">投稿者：</span><span class="name">みなとの</span><span class="sex">(女性)</span></dt>
        <dl><div class="text">昼から夕方までに伺います。</div><div class="time_block">
          <span class="date_text">投稿日：</span><span class="date">2026/07/12(Sun) 02:17:06</span>
          <span class="number_text">記事番号：</span><span class="number">2448</span>
        </div></dl>
      </dl></dd>
    </dl></body></html>`,
    'https://www.barspear.com/bbs/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-12T03:00:00.000Z')

  assert.equal(posts.length, 2)
  assert.equal(posts[0].articleNo, '2445')
  assert.equal(posts[0].authorName, 'たんたん🍥')
  assert.equal(posts[0].body, '今から行きます！')
  assert.equal(posts[1].authorName, 'みなとの')
  assert.equal(posts[1].authorGender, '女性')
  assert.equal(posts[1].body, '昼から夕方までに伺います。')
})

test('normalizes YYBBS customer posts and excludes Silent Moon staff posts', () => {
  const page = extractBbsPageContent(
    `<html><body>
      <article class="art">
        <h2>お知らせ</h2><p>本日も営業しています。</p>
        <div class="art-info"><b>ATOM</b>さん<span class="num">2026/07/10(Fri) 10:07</span></div>
        <div class="rep_button"><a href="./yybbs.cgi?res=46&amp;pg=0">返信</a></div>
      </article>
      <article class="art">
        <h2>無題</h2><p>この後行かせて頂きます</p>
        <div class="art-info"><b>しゅん</b>さん<span class="num">2026/07/07(Tue) 23:13</span></div>
        <div class="rep_button"><a href="./yybbs.cgi?res=41&amp;pg=0">返信</a></div>
      </article>
    </body></html>`,
    'https://www.silent-moon.net/bbs2025/yybbs.cgi',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T01:30:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '41')
  assert.equal(posts[0].authorName, 'しゅん')
  assert.equal(posts[0].postedAt, '2026-07-07T14:13:00.000Z')
  assert.equal(posts[0].body, 'この後行かせて頂きます')
})

test('normalizes Rara posts and excludes board staff replies', () => {
  const page = extractBbsPageContent(
    `<html><body><div>
      <div id="no164520" class="threadTitle"><h2>無題</h2></div>
      <div class="user-box"><div class="user-name">ティナ、なな</div><div class="user-meta">2026/07/10 11:02 No.164520</div></div>
      <div class="spc"><span class="mainText">きました</span></div>
      <div class="res_waku"><div class="rwi" id="no164521">
        <div class="user-box"><div class="user-name">440</div><div class="user-meta">2026/07/10 11:03 No.164521</div></div>
        <div class="spc"><span class="mainText">いらっしゃいませ。</span></div>
      </div></div>
    </div></body></html>`,
    'https://rara.jp/bar440/',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T03:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '164520')
  assert.equal(posts[0].authorName, 'ティナ、なな')
  assert.equal(posts[0].postedAt, '2026-07-10T02:02:00.000Z')
  assert.equal(posts[0].body, 'きました')
})

test('normalizes legacy Rara thread replies and excludes Zeus staff', () => {
  const page = extractBbsPageContent(
    `<html><body>
      <div id="631" class="layer">Re: topic ( No.631 )</div>
      <div class="layer"><div style="float:left">日時： 2026年07月09日 23:09<br>名前： <b>シン</b></div><span class="mainText">待っています</span></div>
      <div id="630" class="layer">Re: topic ( No.630 )</div>
      <div class="layer"><div style="float:left">日時： 2026年07月09日 23:03<br>名前： <b>尋〜Hiro〜👩</b></div><span class="mainText">伺います。</span></div>
    </body></html>`,
    'https://rara.jp/zeus/page613',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-10T03:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '630')
  assert.equal(posts[0].authorName, '尋〜Hiro〜👩')
  assert.equal(posts[0].postedAt, '2026-07-09T14:03:00.000Z')
  assert.equal(posts[0].body, '伺います。')
})

test('normalizes Z-Z board thread posts used by collabo', () => {
  const page = extractBbsPageContent(
    `<html><head><title>7/11(土) 来店予告</title></head><body><main><div class="com">
      <div class="name"><span class="namecolor"><span class="no">1</span> みちお</span></div>
      <div class="stat">♂</div><div class="texts">本日、お伺いします。</div>
      <div class="time"><time datetime="2026-07-11T12:09">7/11(Sat)12:09</time></div>
      <div class="edit"><a href="del1.cgi?id=collabo123&amp;no=12090858">削除</a></div>
    </div></main></body></html>`,
    'https://m.z-z.jp/thbbs.cgi?id=collabo123&th=5606',
  )
  const posts = extractNormalizedBbsPostsFromText(page.extractedText, '2026-07-11T04:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, '12090858')
  assert.equal(posts[0].authorName, 'みちお')
  assert.equal(posts[0].authorGender, '男性')
  assert.equal(posts[0].postedAt, '2026-07-11T03:09:00.000Z')
  assert.match(posts[0].body, /^\[\[NR_TARGET_DATE:2026-07-11\]\]/)
})

test('normalizes Scarlet API comments and excludes staff auto replies', () => {
  const extractedText = extractScarletCommentsPayload({
    success: true,
    data: [
      {
        commentId: 'c-customer-01',
        isStaffReply: false,
        name: 'える♀',
        body: '夜に行きます！',
        createdAt: '2026-07-09T10:47:27.954Z',
      },
      {
        commentId: 'c-staff-01',
        isStaffReply: true,
        name: 'STAFF',
        body: 'スタッフ一同、お待ちしております。',
        createdAt: '2026-07-09T10:47:27.975Z',
      },
    ],
  })
  const posts = extractNormalizedBbsPostsFromText(extractedText, '2026-07-10T03:00:00.000Z')

  assert.equal(posts.length, 1)
  assert.equal(posts[0].articleNo, 'c-customer-01')
  assert.equal(posts[0].authorName, 'える♀')
  assert.equal(posts[0].postedAt, '2026-07-09T10:47:00.000Z')
  assert.equal(posts[0].body, '夜に行きます！')
})

test('discovers latest topic details and BBS iframe pages', () => {
  const topics = extractBbsPageContent(
    `<html><body>
      <a href="/topics/300/">詳細を見る</a><a href="/topics/299/">詳細を見る</a>
      <iframe src="https://board.example.net/bbs/"></iframe>
    </body></html>`,
    'https://example.com/topics/',
  )

  assert.deepEqual(topics.supplementalUrls, [
    'https://example.com/topics/300/',
    'https://example.com/topics/299/',
    'https://board.example.net/bbs/',
  ])
})

test('skips obvious forum spam and continues to customer topics', () => {
  const page = extractBbsPageContent(
    `<html><body><ul>
      <li><a class="bbp-topic-permalink" href="/forums/topic/%d0%b1%d1%83%d1%85/">Бухгалтерские услуги онлайн</a><div>Наши [url=https://spam.example]</div></li>
      <li><a class="bbp-topic-permalink" href="/forums/topic/%d0%bf%d0%bb%d0%b0%d1%82/">платежный агент услуги</a></li>
      <li><a class="bbp-topic-permalink" href="/forums/topic/customer-300/">初めてです</a><div>今夜伺います</div></li>
      <li><a class="bbp-topic-permalink" href="/forums/topic/customer-299/">今から</a><div>これから向かいます</div></li>
    </ul></body></html>`,
    'https://example.com/forums/forum/bbs/',
  )

  assert.deepEqual(page.supplementalUrls, [
    'https://example.com/forums/topic/customer-300/',
    'https://example.com/forums/topic/customer-299/',
  ])
})

test('discovers latest Rara thread details', () => {
  const page = extractBbsPageContent(
    `<html><body>
      <a href="./page632">最新トピック</a>
      <a href="./page630">前のトピック</a>
      <a href="./new">新規作成</a>
    </body></html>`,
    'https://rara.jp/zeus/',
  )

  assert.deepEqual(page.supplementalUrls, [
    'https://rara.jp/zeus/page632',
    'https://rara.jp/zeus/page630',
  ])
})

test('browser screenshots never replace canonical scrape text', async () => {
  const snapshot = await buildBbsSnapshot(
    {
      id: 'test-source',
      storeId: 'test-store',
      label: 'BBS',
      url: 'https://example.com/bbs',
      parserType: 'auto',
      active: true,
      crawlIntervalMinutes: 5,
      lastStatus: 'pending',
    },
    {
      status: 'ok',
      url: 'https://example.com/bbs',
      title: 'BBS',
      extractedText: '投稿者: あや（女性） 2026/07/14 10:00 本文です',
      fetchedAt: '2026-07-14T01:00:00.000Z',
    },
    {
      capture: async () => ({
        screenshotDataUrl: 'data:image/jpeg;base64,dGVzdA==',
        extractedText: '画面装飾だけで投稿本文がないテキスト',
      }),
      close: async () => {},
    },
    { captureBrowserScreenshot: true },
  )

  assert.equal(snapshot.extractedText, '投稿者: あや（女性） 2026/07/14 10:00 本文です')
  assert.match(snapshot.screenshotDataUrl ?? '', /^data:image\/jpeg/)
})
