import {
  ArrowRight,
  BookmarkSimple,
  CalendarDots,
  ChartBar,
  Clock,
  Crosshair,
  Eye,
  FileText,
  Fire,
  Gauge,
  Lightning,
  MagnifyingGlass,
  Megaphone,
  Pulse,
  Question,
  Stack,
  TrendUp,
} from '@phosphor-icons/react/ssr'
import Image from 'next/image'
import styles from './night-radar-landing.module.css'
import { NightRadarMotion } from './night-radar-motion'

const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''

function appHref(path = '/') {
  const normalizedPath = path || '/'
  if (!appBaseUrl) return normalizedPath
  return `${appBaseUrl.replace(/\/$/, '')}${normalizedPath}`
}

const navItems = [
  { label: '機能', href: '#features' },
  { label: '仕組み', href: '#workflow' },
  { label: '導入事例', href: '#cases' },
  { label: '料金', href: '#pricing' },
]

const stats = [
  { label: '候補発見率', value: '2.1倍以上', note: '当日比較ベース', Icon: Gauge },
  { label: 'カバー率', value: '85%超', note: '主要情報の平均', Icon: Stack },
  { label: '情報更新', value: 'リアルタイム', note: '自動収集 & 解析', Icon: Lightning },
]

const painCards = [
  {
    title: '見落としが多い',
    body: 'BBSやイベントを全部見るのは大変…',
    Icon: Eye,
  },
  {
    title: '情報が古い・遅い',
    body: '更新や投稿に気づくのに時間がかかる…',
    Icon: Clock,
  },
  {
    title: 'どこを見ればいいかわからない',
    body: '検索しても答えが見つけづらい…',
    Icon: Question,
  },
  {
    title: '判断に時間がかかる',
    body: '材料がバラバラで比較しにくい…',
    Icon: TrendUp,
  },
]

const whiteTiles = [
  {
    title: 'BBSトップ画面に常時配置',
    body: '最初に見るべき情報をすぐにキャッチ',
    Icon: Eye,
  },
  {
    title: '店舗ごとの盛り上がりを比較',
    body: '地域・店舗の温度差を可視化',
    Icon: ChartBar,
  },
  {
    title: '検索条件は保存して使い回し可能',
    body: 'お気に入り条件で即座にアクセス',
    Icon: BookmarkSimple,
  },
  {
    title: 'スマホで即イベント詳細を確認',
    body: '外出先でもすぐに確認',
    Icon: MagnifyingGlass,
  },
]

const processItems = [
  {
    title: 'Hot比較',
    body: '盛り上がりを比較し、優先順位を明確に。',
    Icon: Fire,
    tone: 'heat',
  },
  {
    title: '月間イベント',
    body: '公式イベントや傾向をカレンダーで把握。',
    Icon: CalendarDots,
    tone: 'month',
  },
  {
    title: '注目ワード監視',
    body: '重要ワードの出現を通知でお知らせ。',
    Icon: MagnifyingGlass,
    tone: 'watch',
  },
  {
    title: '観測ログ',
    body: '過去のBBS情報を保存し、振り返りが可能。',
    Icon: FileText,
    tone: 'log',
  },
  {
    title: '完全一致検索',
    body: '人名・店名・時間などを完全一致で素早く検索。',
    Icon: Crosshair,
    tone: 'search',
  },
]

const flowLabels = ['公開情報を最速収集', '判断材料に変換する', '今日の候補を提示']

const flowDetails = [
  {
    title: '公開情報を最速取得',
    body: '公開BBSとイベントページを自動収集し、最新の情報を整えます。',
    Icon: Megaphone,
    tone: 'lime',
  },
  {
    title: '判断材料に変換する',
    body: '独自の指標で、イベント内を比較できる形に整理します。',
    Icon: CalendarDots,
    tone: 'purple',
  },
  {
    title: '今日の候補を提示',
    body: '独自のスコアに基づき、今日の注目店を表示します。',
    Icon: BookmarkSimple,
    tone: 'blue',
  },
]

const picks = [
  { name: 'bar AA', value: '67%', tone: 'orange' },
  { name: 'bar CA', value: '48%', tone: 'purple' },
  { name: 'bar BB', value: '36%', tone: 'blue' },
]

const checklist = ['公開情報ベースで運用', '店舗ごとの効果を蓄積', '広告分析 / アプリ連携と連動']

export function NightRadarLanding() {
  return (
    <main className={styles.landing} id="main" data-motion-root>
      <NightRadarMotion />
      <div className={styles.pageNoise} aria-hidden="true" />
      <header className={styles.header} data-reveal="header">
        <a className={styles.logo} href="#main" aria-label="ナイトレーダーの先頭へ">
          <Pulse size={28} weight="bold" aria-hidden="true" />
          <span>ナイトレーダー</span>
        </a>
        <nav className={styles.nav} aria-label="主要ナビゲーション">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.loginLink} href={appHref('/login')}>
            ログイン
          </a>
          <a className={styles.headerCta} href={appHref('/signup')}>
            β版を試す
          </a>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title" data-hero>
        <div className={styles.heroTexture} aria-hidden="true" data-hero-texture />
        <p className={styles.heroKicker} data-reveal="kicker">
          公開情報を価値に変えるナイトレーダー
        </p>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title" data-reveal="headline">
              BBSとイベントを、
              <br />
              今日の<span>候補</span>に変える。
            </h1>
            <p className={styles.heroLead} data-reveal="lead">
              公開BBS、店舗イベント、関連情報を一括収集。
              <br />
              見逃れがちな公開ほど、素早く見つかる設計。
            </p>
            <div className={styles.heroActions} data-reveal="hero-actions">
              <a className={styles.primaryButton} href={appHref('/signup')}>
                β版を試す
                <ArrowRight size={19} weight="bold" aria-hidden="true" />
              </a>
              <a className={styles.secondaryButton} href="#features">
                デモを体験する
              </a>
            </div>
            <dl className={styles.stats} data-reveal="stats">
              {stats.map(({ label, value, note, Icon }) => (
                <div key={label} className={styles.stat} data-spotlight-card>
                  <dt>
                    <Icon size={30} weight="regular" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{value}</dd>
                  <small>{note}</small>
                </div>
              ))}
            </dl>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.verticalWord} aria-hidden="true" data-vertical-word>
              NIGHTRADAR
            </div>
            <div className={styles.heroBrush} aria-hidden="true" data-hero-brush />
            <div className={styles.phoneAnchor}>
              <Image
                className={styles.phoneImage}
                data-phone
                src="/lp/generated/hero-iphone-device.png"
                width={754}
                height={1377}
                priority
                alt="ナイトレーダーのスマホ画面。注目店、期待度ランキング、最終更新時刻が表示されている。"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.sectionBlock}
        id="features"
        aria-labelledby="pain-title"
        data-motion-section
      >
        <div className={styles.sectionIntro} data-section-intro>
          <p className={styles.sectionNumber}>01</p>
          <h2 id="pain-title">
            こんな悩み、
            <br />
            ありませんか？
          </h2>
          <p>情報の見落としが、大きな機会損失につながります。</p>
        </div>
        <div className={styles.painGrid}>
          {painCards.map(({ title, body, Icon }) => (
            <article className={styles.painCard} key={title} data-motion-item data-spotlight-card>
              <Icon size={66} weight="light" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.sectionBlock}
        id="workflow"
        aria-labelledby="workflow-title"
        data-motion-section
      >
        <div className={styles.sectionIntro} data-section-intro>
          <p className={styles.sectionNumber}>02</p>
          <h2 id="workflow-title">
            BBSを先に見る
            <br />
            設計です。
          </h2>
          <p>最初に当てるのが “見ること”。今日の勝ち筋を逃さない設計で「仕込みから初動」を支えます。</p>
        </div>
        <div className={styles.workflowGrid}>
          <div className={styles.tileGrid}>
            {whiteTiles.map(({ title, body, Icon }) => (
              <article className={styles.whiteTile} key={title} data-motion-item data-spotlight-card>
                <Icon size={35} weight="regular" aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <figure className={styles.alleyFigure} data-motion-item data-motion-card>
            <Image
              src="/lp/generated/night-alley.png"
              width={1672}
              height={941}
              loading="lazy"
              alt="雨上がりの夜の路地。ネオン看板とBARの看板が並んでいる。"
            />
          </figure>
        </div>
      </section>

      <section className={styles.sectionBlock} aria-labelledby="materials-title" data-motion-section>
        <div className={styles.sectionIntro} data-section-intro>
          <p className={styles.sectionNumberAlt}>03</p>
          <h2 id="materials-title">
            候補を決める
            <br />
            材料だけを残す。
          </h2>
          <p>多すぎる情報をそぎ落とし、判断に直結する材料だけをシンプルに。</p>
        </div>
        <div className={styles.processPanel}>
          {processItems.map(({ title, body, Icon, tone }) => (
            <article className={styles.processItem} key={title} data-motion-item data-spotlight-card>
              <div className={`${styles.processIcon} ${styles[tone]}`}>
                <Icon size={39} weight="regular" aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.sectionBlock}
        id="cases"
        aria-labelledby="radar-title"
        data-motion-section
      >
        <div className={styles.sectionIntro} data-section-intro>
          <p className={styles.sectionNumber}>04</p>
          <h2 id="radar-title">
            集めて、整えて、
            <br />
            今日に落とす。
          </h2>
          <p>公開情報を自動で集め、判断材料に変換。今日の候補を、迷わず提示します。</p>
        </div>
        <div className={styles.radarGrid}>
          <div
            className={styles.radarMap}
            aria-label="公開情報から今日の候補までの変換フロー"
            data-motion-item
            data-radar
          >
            {flowLabels.map((label, index) => (
              <div className={styles.flowLabel} key={label} data-index={index}>
                {label}
              </div>
            ))}
            <div className={styles.radarCore} aria-hidden="true">
              <Pulse size={54} weight="bold" />
            </div>
          </div>
          <div className={styles.flowDetails}>
            {flowDetails.map(({ title, body, Icon, tone }) => (
              <article className={styles.flowItem} key={title} data-motion-item data-spotlight-card>
                <span className={`${styles.flowIcon} ${styles[tone]}`}>
                  <Icon size={27} weight="regular" aria-hidden="true" />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
          <aside
            className={styles.pickCard}
            aria-label="今日の候補"
            data-motion-item
            data-spotlight-card
          >
            <p className={styles.pickLabel}>TODAY&apos;S PICKS</p>
            <div className={styles.scoreRing}>
              <strong>67%</strong>
            </div>
            <ul>
              {picks.map((pick) => (
                <li key={pick.name}>
                  <span className={styles[pick.tone]} aria-hidden="true" />
                  <span>{pick.name}</span>
                  <strong>{pick.value}</strong>
                </li>
              ))}
            </ul>
            <p className={styles.pickTime}>最終更新&nbsp;20:26</p>
          </aside>
        </div>
      </section>

      <section
        className={styles.bottomGrid}
        id="pricing"
        aria-labelledby="pricing-title"
        data-motion-section
      >
        <article className={styles.analyticsCard} data-motion-item data-spotlight-card>
          <div>
            <p className={styles.sectionNumber}>05</p>
            <h2 id="pricing-title">
              店舗掲載や広告にも
              <br />
              使える計測面。
            </h2>
            <p>
              日別イベント、BBS反応、広告掲載の効果測定に役立つデータを提供。
              ユーザー向けの分析機能と広告運用の改善をサポートします。
            </p>
          </div>
          <div className={styles.chartPanel} aria-label="効果測定グラフ" data-chart>
            <span className={styles.barOne} data-chart-bar />
            <span className={styles.barTwo} data-chart-bar />
            <span className={styles.barThree} data-chart-bar />
            <span className={styles.barFour} data-chart-bar />
            <span className={styles.barFive} data-chart-bar />
          </div>
          <ul className={styles.checkList}>
            {checklist.map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.ctaPanel} data-motion-item data-spotlight-card>
          <div className={styles.ctaTexture} aria-hidden="true" />
          <p className={styles.sectionNumberAlt}>05</p>
          <h2>
            登録後すぐに
            <br />
            判断材料を確認できます。
          </h2>
          <p>BBS、月間イベント、注目ワード状況、店舗のランキングをログイン後すぐに確認できます。</p>
          <a className={styles.primaryButton} href={appHref('/signup')}>
            β版を試す
            <ArrowRight size={19} weight="bold" aria-hidden="true" />
          </a>
        </article>
      </section>

      <footer className={styles.footer}>
        <a className={styles.logo} href="#main" aria-label="ナイトレーダーの先頭へ">
          <Pulse size={28} weight="bold" aria-hidden="true" />
          <span>ナイトレーダー</span>
        </a>
        <nav aria-label="フッターナビゲーション">
          <a href={appHref('/privacy')}>プライバシー</a>
          <a href={appHref('/terms')}>利用規約</a>
          <a href={appHref('/contact')}>お問い合わせ</a>
          <a href={appHref('/login')}>ログイン</a>
        </nav>
      </footer>
    </main>
  )
}
