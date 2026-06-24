'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Lenis from 'lenis'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  BellRinging,
  CalendarBlank,
  ChartDonut,
  Crosshair,
  Database,
  MagnifyingGlass,
  Pulse,
  ShieldCheck,
  Storefront,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import styles from './night-radar-landing.module.css'

const MotionSection = motion.section
const MotionDiv = motion.div
const motionEase = [0.16, 1, 0.3, 1] as const

const features = [
  {
    icon: <ChartDonut size={24} weight="bold" />,
    title: 'Hot比率',
    text: '店舗ごとの書き込み量、投稿鮮度、曜日相性をまとめ、比較しやすい順に表示します。',
  },
  {
    icon: <CalendarBlank size={24} weight="bold" />,
    title: '月間イベント',
    text: '公式イベント情報を月表示に集約。日別の詳細はスマホでもすぐ確認できます。',
  },
  {
    icon: <MagnifyingGlass size={24} weight="bold" />,
    title: '完全一致検索',
    text: '人気単独男性、人気単独女性、不人気ワードを分類して全店BBSから探せます。',
  },
  {
    icon: <BellRinging size={24} weight="bold" />,
    title: '注目ワード監視',
    text: '初めて、久しぶり、複数人、絵文字など、見落としたくない投稿を拾います。',
  },
  {
    icon: <Database size={24} weight="bold" />,
    title: '観測ログ',
    text: '巡回したBBS情報を保存し、店舗ごとの傾向としてあとから見返せます。',
  },
]

const workflow = [
  {
    title: '公開情報を集める',
    text: '店舗のBBSとイベントページを登録し、定期的に状態を取得します。',
  },
  {
    title: '判断材料に変換する',
    text: '投稿の鮮度、曜日、ワード、イベント内容を同じ基準で読み替えます。',
  },
  {
    title: '今日の候補を見る',
    text: '盛り上がり比率、上位店舗、月間イベントをトップ画面に集約します。',
  },
]

const proofItems = [
  'BBSをトップ画面の中心に配置',
  '店舗ごとの盛り上がりを比率で比較',
  '検索条件は保存して使い回し可能',
  'スマホで日別イベント詳細を確認',
]

function sectionMotion(reduce = false) {
  if (reduce) return {}
  return {
    whileInView: { opacity: 1 },
    transition: { duration: 0.4, ease: motionEase },
    viewport: { once: true, amount: 0.18 },
  }
}

function cardMotion(index = 0, reduce = false) {
  if (reduce) return {}
  return {
    whileHover: { y: index % 2 === 0 ? -3 : -2 },
    transition: { duration: 0.24, ease: motionEase },
  }
}

export function NightRadarLanding() {
  const rootRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const shouldReduceMotion = Boolean(reduceMotion)

  useEffect(() => {
    if (shouldReduceMotion) return

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      touchMultiplier: 0.8,
      wheelMultiplier: 0.86,
    })
    let rafId = 0

    const raf = (time: number) => {
      lenis.raf(time)
      rafId = window.requestAnimationFrame(raf)
    }

    rafId = window.requestAnimationFrame(raf)

    return () => {
      window.cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [shouldReduceMotion])

  useGSAP(
    () => {
      if (shouldReduceMotion) return

      gsap.from(`.${styles.heroWord}`, {
        y: 18,
        opacity: 0,
        filter: 'blur(8px)',
        duration: 0.82,
        ease: 'power3.out',
        stagger: 0.09,
      })
      gsap.from(`.${styles.heroCopy} p, .${styles.heroActions}`, {
        y: 12,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.08,
        delay: 0.18,
      })
    },
    { scope: rootRef, dependencies: [shouldReduceMotion], revertOnUpdate: true }
  )

  return (
    <main className={styles.landing} id="main" ref={rootRef}>
      <div className={styles.backdrop} aria-hidden="true" />

      <header className={styles.nav}>
        <Link className={styles.brand} href="/">
          <Crosshair size={22} weight="bold" />
          <span>ナイトレーダー</span>
        </Link>
        <nav aria-label="LP内ナビゲーション">
          <a href="#features">機能</a>
          <a href="#workflow">仕組み</a>
          <a href="#contact">導入</a>
        </nav>
        <Link className={styles.navCta} href="/">
          アプリを開く
        </Link>
      </header>

      <section className={styles.hero}>
        <MotionDiv className={styles.heroCopy} {...sectionMotion(shouldReduceMotion)}>
          <span className={styles.kicker}>公開情報を一画面へ</span>
          <h1>
            <span className={styles.heroWord}>BBSとイベントを、</span>
            <span className={styles.heroWord}>今日の候補に変える。</span>
          </h1>
          <p>公開BBS、店舗イベント、曜日傾向を一画面に圧縮。迷う前に見るべき店舗と日付だけを残します。</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/">
              アプリを開く
            </Link>
            <a className={styles.secondaryButton} href="#features">
              機能を見る
            </a>
          </div>
        </MotionDiv>

        <MotionDiv className={styles.heroVisual} {...sectionMotion(shouldReduceMotion)}>
          <div className={styles.radarPlate} aria-hidden="true">
            <span />
          </div>
          <div className={styles.phoneFrame}>
            <Image
              alt="ナイトレーダーのスマホ画面。今日の判定、盛り上がり比率、月間イベントが表示されている。"
              src="/lp/app-preview-mobile.png"
              width={390}
              height={844}
              priority
              sizes="(max-width: 768px) 74vw, 360px"
            />
          </div>
        </MotionDiv>
      </section>

      <MotionSection className={styles.signalBand} {...sectionMotion(shouldReduceMotion)}>
        <div>
          <strong>見る場所が散らばる</strong>
          <span>BBS、イベント、曜日感を別々に追う手間を減らします。</span>
        </div>
        <div>
          <strong>温度感が読みにくい</strong>
          <span>店舗ごとの投稿量と鮮度を比率で比較します。</span>
        </div>
        <div>
          <strong>ワード監視が属人化する</strong>
          <span>人気単独男性、人気単独女性、不人気ワードを分けて確認できます。</span>
        </div>
      </MotionSection>

      <MotionSection className={styles.productProof} {...sectionMotion(shouldReduceMotion)}>
        <div className={styles.sectionLead}>
          <span>トップ画面</span>
          <h2>BBSを先に見る設計です。</h2>
          <p>最初に出すのは説明ではなく、今日の結論。補足情報は必要な分だけ下に置きます。</p>
        </div>
        <div className={styles.proofGrid}>
          {proofItems.map((item, index) => (
            <MotionDiv className={styles.proofItem} key={item} {...cardMotion(index, shouldReduceMotion)}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </MotionDiv>
          ))}
        </div>
      </MotionSection>

      <MotionSection className={styles.features} id="features" {...sectionMotion(shouldReduceMotion)}>
        <div className={styles.sectionLead}>
          <span>主要機能</span>
          <h2>候補を決める材料だけを残す。</h2>
          <p>多すぎる情報をそのまま見せず、行く余地がある店舗を比較できる形へ整理します。</p>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <MotionDiv className={styles.featureCard} key={feature.title} {...cardMotion(index, shouldReduceMotion)}>
              <div>{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </MotionDiv>
          ))}
        </div>
      </MotionSection>

      <MotionSection className={styles.workflow} id="workflow" {...sectionMotion(shouldReduceMotion)}>
        <div className={styles.workflowVisual} aria-hidden="true">
          <Pulse size={54} weight="duotone" />
          <span />
        </div>
        <div className={styles.workflowCopy}>
          <div className={styles.sectionLead}>
            <span>仕組み</span>
            <h2>集めて、整えて、今日に落とす。</h2>
          </div>
          <div className={styles.workflowList}>
            {workflow.map((item, index) => (
              <MotionDiv className={styles.workflowItem} key={item.title} {...cardMotion(index, shouldReduceMotion)}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </MotionSection>

      <MotionSection className={styles.operatorPanel} {...sectionMotion(shouldReduceMotion)}>
        <div>
          <Storefront size={30} weight="bold" />
          <h2>店舗掲載や広告にも使える計測面。</h2>
          <p>
            店舗イベント、BBS反応、来店候補の流れを同じ画面で見せられるため、ユーザー向けの判断材料と店舗側の掲載価値を分けずに扱えます。
          </p>
        </div>
        <div className={styles.operatorList}>
          <span>公開情報ベースで運用</span>
          <span>店舗ごとの傾向を蓄積</span>
          <span>広告枠はアプリ内導線と連動</span>
        </div>
      </MotionSection>

      <MotionSection className={styles.ctaPanel} id="contact" {...sectionMotion(shouldReduceMotion)}>
        <ShieldCheck size={34} weight="bold" />
        <h2>まずはデモで判断できます。</h2>
        <p>登録店舗、BBS、イベント、検索条件の流れをそのまま確認できます。</p>
        <Link className={styles.primaryButton} href="/">
          アプリを開く
        </Link>
      </MotionSection>

      <footer className={styles.footer}>
        <span>ナイトレーダー</span>
        <nav aria-label="法務リンク">
          <Link href="/privacy">プライバシー</Link>
          <Link href="/terms">利用規約</Link>
          <Link href="/">アプリへ戻る</Link>
        </nav>
      </footer>
    </main>
  )
}
