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
import { NightRadarAgeGate } from './night-radar-age-gate'
import { NightRadarMotion } from './night-radar-motion'

function appHref(path = '/') {
  return path || '/'
}

const stats = [
  { label: '結論表示', value: '3候補', note: '本命・比較・後回し', Icon: Gauge },
  { label: '見る範囲', value: 'BBS + 予定', note: '公開情報ベース', Icon: Stack },
  { label: '取得状態', value: '可視化', note: '古い情報も判別', Icon: Lightning },
]

const painCards = [
  {
    title: '候補が増えすぎる',
    body: '店ごとのBBSとイベントを見始めると、比較の軸がすぐに散らばります。',
    Icon: Eye,
  },
  {
    title: '更新の新旧が分かりにくい',
    body: '同じ投稿が何度も目に入り、今見るべき情報か判断しづらくなります。',
    Icon: Clock,
  },
  {
    title: '予定とBBSが分断される',
    body: 'イベント、料金、営業時間、直近投稿を別々に確認する必要があります。',
    Icon: Question,
  },
  {
    title: '最後の一押しがない',
    body: '盛り上がりは見えても、今日行く理由まで整理されていません。',
    Icon: TrendUp,
  },
]

const whiteTiles = [
  {
    title: '今日の結論から開く',
    body: '本命・比較・後回しの3枠で、最初に見る店を固定',
    Icon: Eye,
  },
  {
    title: '店舗ごとの盛り上がりを比較',
    body: '女性反応、更新、予定、営業時間、料金帯を同じ軸で確認',
    Icon: ChartBar,
  },
  {
    title: '気になる名前だけ監視',
    body: '本文ではなく投稿者名を直近24時間で照合',
    Icon: BookmarkSimple,
  },
  {
    title: '月間予定を行く前に確認',
    body: '朝イベ、夜イベ、BINGO、誕生日を分けて見る',
    Icon: MagnifyingGlass,
  },
]

const processItems = [
  {
    title: 'Hot比較',
    body: '直近の反応から、今日の候補を3店まで絞ります。',
    Icon: Fire,
    tone: 'heat',
  },
  {
    title: '月間イベント',
    body: '朝・夜・注目タグを切り替えて予定を確認します。',
    Icon: CalendarDots,
    tone: 'month',
  },
  {
    title: '注目ワード監視',
    body: '気になる名前や保存ワードを直近投稿から拾います。',
    Icon: MagnifyingGlass,
    tone: 'watch',
  },
  {
    title: '観測ログ',
    body: '取得状態を残し、古い情報と新しい情報を分けます。',
    Icon: FileText,
    tone: 'log',
  },
  {
    title: '行く前チェック',
    body: '店舗URL、地図、料金、BBS、イベントを一画面にまとめます。',
    Icon: Crosshair,
    tone: 'search',
  },
]

const flowLabels = ['公開情報を取得', '5指標に整理', '今日の候補を提示']

const flowDetails = [
  {
    title: '公開情報を取得',
    body: 'BBSとイベントページを巡回し、取得できた情報と古い情報を分けます。',
    Icon: Megaphone,
    tone: 'lime',
  },
  {
    title: '5指標に整理',
    body: '女性書き込み、更新、イベント、営業時間、料金帯だけを比較軸にします。',
    Icon: CalendarDots,
    tone: 'orange',
  },
  {
    title: '今日の候補を提示',
    body: '本命、比較、後回しの3枠で、最初に見るべき店を表示します。',
    Icon: BookmarkSimple,
    tone: 'lime',
  },
]

const picks = [
  { name: '本命候補', value: '90点', tone: 'orange' },
  { name: '比較候補', value: '82点', tone: 'lime' },
  { name: '後回し', value: '21点', tone: 'blue' },
]

const checklist = ['公開情報ベースで運用', '店舗ごとの反応を蓄積', '今日行く店の判断に直結']

export function NightRadarLanding() {
  return (
    <main className={styles.landing} id="main" data-motion-root>
      <NightRadarAgeGate />
      <NightRadarMotion />
      <div className={styles.pageNoise} aria-hidden="true" />
      <div className={styles.signalField} aria-hidden="true">
        <span className={styles.signalSweep} data-bg-sweep />
        <svg className={styles.signalLines} viewBox="0 0 1440 980" preserveAspectRatio="none">
          <path data-bg-lane d="M-40 198 C 238 118, 348 280, 574 204 S 924 74, 1480 154" />
          <path data-bg-lane d="M-60 562 C 246 468, 382 650, 640 574 S 1034 430, 1500 506" />
          <path data-bg-lane d="M-80 816 C 196 760, 422 860, 684 790 S 1128 640, 1518 708" />
        </svg>
      </div>
      <header className={styles.header} data-reveal="header">
        <a className={styles.logo} href="#main" aria-label="ナイトレーダーの先頭へ">
          <Pulse size={28} weight="bold" aria-hidden="true" />
          <span>ナイトレーダー</span>
        </a>
        <div className={styles.headerActions}>
          <a className={styles.headerCta} href={appHref('/signup?next=/app')}>
            β版を試す
          </a>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title" data-hero>
        <div className={styles.heroTexture} aria-hidden="true" data-hero-texture />
        <p className={styles.heroKicker} data-reveal="kicker">
          今日行く店を決めるための公開情報レーダー
        </p>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title" data-reveal="headline">
              <span className={styles.heroPhrase}>BBSとイベントを、</span>
              <span className={styles.heroPhrase}>
                今日の<span className={styles.heroAccent}>候補</span>に変える。
              </span>
            </h1>
            <p className={styles.heroLead} data-reveal="lead">
              公開BBS、店舗イベント、直近投稿を整理し、候補・比較・見送りを一画面で確認できます。
            </p>
            <div className={styles.heroActions} data-reveal="hero-actions">
              <a className={styles.primaryButton} href={appHref('/signup?next=/app')}>
                β版を試す
                <ArrowRight size={19} weight="bold" aria-hidden="true" />
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
                src="/lp/generated/hero-iphone-device.webp"
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
          <div className={styles.sectionMarker}>
            <p className={styles.sectionNumber}>01</p>
            <span className={styles.sectionRole}>課題整理</span>
          </div>
          <h2 id="pain-title">
            <span className={styles.headingPhrase}>こんな悩み、</span>
            <span className={styles.headingPhrase}>ありませんか？</span>
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
          <div className={styles.sectionMarker}>
            <p className={styles.sectionNumber}>02</p>
            <span className={styles.sectionRole}>使い方</span>
          </div>
          <h2 id="workflow-title">
            <span className={styles.headingPhrase}>BBSを先に見る</span>
            <span className={styles.headingPhrase}>設計です。</span>
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
              src="/lp/generated/night-alley.webp"
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
          <div className={styles.sectionMarker}>
            <p className={styles.sectionNumberAlt}>03</p>
            <span className={styles.sectionRole}>判断材料</span>
          </div>
          <h2 id="materials-title">
            <span className={styles.headingPhrase}>候補を決める</span>
            <span className={styles.headingPhrase}>材料だけを残す。</span>
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
        id="decision-flow"
        aria-labelledby="radar-title"
        data-motion-section
      >
        <div className={styles.sectionIntro} data-section-intro>
          <div className={styles.sectionMarker}>
            <p className={styles.sectionNumber}>04</p>
            <span className={styles.sectionRole}>判断の流れ</span>
          </div>
          <h2 id="radar-title">
            <span className={styles.headingPhrase}>公開情報が、</span>
            <span className={styles.headingPhrase}>候補に変わる流れ。</span>
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
            <div className={styles.sectionMarker}>
              <p className={styles.sectionNumber}>05</p>
              <span className={styles.sectionRole}>掲載・広告</span>
            </div>
            <h2 id="pricing-title">
              <span className={styles.headingPhrase}>店舗掲載や広告にも</span>
              <span className={styles.headingPhrase}>使える計測面。</span>
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
          <div className={styles.sectionMarker}>
            <p className={styles.sectionNumberAlt}>06</p>
            <span className={styles.sectionRole}>開始</span>
          </div>
          <h2>
            <span className={styles.headingPhrase}>登録後すぐに</span>
            <span className={styles.headingPhrase}>判断材料を確認できます。</span>
          </h2>
          <p>BBS、月間イベント、注目ワード状況、店舗のランキングをログイン後すぐに確認できます。</p>
          <a className={styles.primaryButton} href={appHref('/signup?next=/app')}>
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
          <a href={appHref('/login?next=/app')}>ログイン</a>
        </nav>
      </footer>
    </main>
  )
}
