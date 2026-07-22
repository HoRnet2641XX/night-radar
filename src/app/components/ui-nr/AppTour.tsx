'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ListFilter,
  Navigation,
  Radar,
  SlidersHorizontal,
  Store,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

export const APP_TOUR_STORAGE_KEY = 'night-radar:guided-tour:v2';

export type AppTourDestination = 'home' | 'detail' | 'detail-name-search';

type TourStep = {
  target: string;
  destination: AppTourDestination;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  skipScroll?: boolean;
  scrollBlock?: ScrollLogicalPosition;
  mobileScrollOffset?: number;
};

const TOUR_STEPS: TourStep[] = [
  {
    target: 'today-hero',
    destination: 'home',
    eyebrow: '最初に確認',
    title: '今日の1位と、女性率を見る',
    description: '当日顧客投稿が最も多い店舗です。投稿総数・直近3時間・全投稿に占める女性率を、同じ基準で確認できます。',
    icon: Radar,
  },
  {
    target: 'top-candidates',
    destination: 'home',
    eyebrow: '次に比較',
    title: '候補は上位3店だけを比べる',
    description: '店側の告知を除いた当日投稿を基準に、今日の予定と投稿者区分を添えて比較します。',
    icon: ListFilter,
  },
  {
    target: 'quick-filters',
    destination: 'home',
    eyebrow: '条件を調整',
    title: '優先したい条件を1つ選ぶ',
    description: '営業中・女性投稿あり・予定あり・初めて向けから選ぶと、条件に合う上位3店へすぐ絞れます。',
    icon: SlidersHorizontal,
  },
  {
    target: 'store-detail',
    destination: 'detail',
    eyebrow: '店舗を確認',
    title: '1店を開いて、判断の根拠を見る',
    description: '店舗詳細では、当日順位・エリア・営業時間・投稿者数・来店予告をまとめて確認できます。候補に保存したり、公式情報へ進むこともできます。',
    icon: Store,
    scrollBlock: 'start',
  },
  {
    target: 'name-search',
    destination: 'detail-name-search',
    eyebrow: '名前を確認',
    title: '気になる投稿者名から探せる',
    description: '検索対象を「名前」にした状態で、取得済み投稿の投稿者名を絞り込めます。この店舗内だけでなく「全店舗から探す」へ切り替えることもできます。',
    icon: UserRound,
    mobileScrollOffset: -24,
  },
  {
    target: 'bottom-navigation',
    destination: 'detail',
    eyebrow: '詳しく確認',
    title: '根拠や投稿は下部メニューから',
    description: '店舗詳細、投稿検索、予定、データ状態へ移動できます。迷ったらホームへ戻れば、今日の結論を確認できます。',
    icon: Navigation,
    skipScroll: true,
  },
];

type SpotlightBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
};

function rememberTour() {
  try {
    window.localStorage.setItem(APP_TOUR_STORAGE_KEY, 'completed');
  } catch {
    // The guide still closes when storage is unavailable.
  }
}

export function AppTour({
  open,
  onOpenChange,
  onDestinationChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDestinationChange: (destination: AppTourDestination) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const step = TOUR_STEPS[stepIndex];
  const StepIcon = step.icon;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const closeTour = useCallback(() => {
    rememberTour();
    setStepIndex(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const measureTarget = useCallback(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!target) {
      setSpotlight(null);
      return null;
    }

    const rect = target.getBoundingClientRect();
    const padding = window.innerWidth < 640 ? 6 : 10;
    const left = Math.max(8, rect.left - padding);
    const top = Math.max(8, rect.top - padding);
    const right = Math.min(window.innerWidth - 8, rect.right + padding);
    const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);
    setSpotlight({
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      radius: window.innerWidth < 640 ? 18 : 26,
    });
    return target;
  }, [step.target]);

  useEffect(() => {
    if (!open) return;

    onDestinationChange(step.destination);
  }, [onDestinationChange, open, step.destination]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.requestAnimationFrame(() => nextButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTour();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      previousFocusRef.current?.focus();
    };
  }, [closeTour, open]);

  useEffect(() => {
    if (!open) return;

    let animationFrame = 0;
    const settleTimers: number[] = [];
    let observer: ResizeObserver | null = null;
    let observedTarget: HTMLElement | null = null;
    let hasScrolled = false;

    const update = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => void measureTarget());
    };

    const prepareTarget = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!target) {
        setSpotlight(null);
        return;
      }

      if (!hasScrolled && !step.skipScroll) {
        const bodyOverflow = document.body.style.overflow;
        const htmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        target.scrollIntoView({ block: step.scrollBlock ?? 'center', behavior: 'auto' });
        if (window.innerWidth < 640 && step.mobileScrollOffset) {
          window.scrollBy({ top: step.mobileScrollOffset, behavior: 'auto' });
        }
        document.body.style.overflow = bodyOverflow;
        document.documentElement.style.overflow = htmlOverflow;
        hasScrolled = true;
      }

      if (target !== observedTarget && 'ResizeObserver' in window) {
        observer?.disconnect();
        observer = new ResizeObserver(update);
        observer.observe(target);
        observedTarget = target;
      }
      update();
    };

    const handleResize = () => {
      hasScrolled = false;
      prepareTarget();
    };

    prepareTarget();
    for (const delay of [80, 200, 420, 720]) {
      settleTimers.push(window.setTimeout(prepareTarget, delay));
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', update, true);

    return () => {
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [measureTarget, open, step.mobileScrollOffset, step.scrollBlock, step.skipScroll, step.target]);

  if (!open || typeof document === 'undefined') return null;

  const spotlightStyle = spotlight
    ? ({
        '--tour-left': `${spotlight.left}px`,
        '--tour-top': `${spotlight.top}px`,
        '--tour-width': `${spotlight.width}px`,
        '--tour-height': `${spotlight.height}px`,
        '--tour-radius': `${spotlight.radius}px`,
      } as CSSProperties)
    : undefined;

  return createPortal(
    <div className="nr-tour-layer" data-has-target={Boolean(spotlight)}>
      {spotlight && <div className="nr-tour-spotlight" style={spotlightStyle} aria-hidden="true" />}
      <section
        ref={dialogRef}
        className="nr-tour-dialog"
        data-step-target={step.target}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        aria-describedby="app-tour-description"
      >
        <header className="nr-tour-header">
          <div className="nr-tour-step-mark" aria-hidden="true"><StepIcon size={18} strokeWidth={1.9} /></div>
          <div>
            <span>{step.eyebrow}</span>
            <small>{stepIndex + 1} / {TOUR_STEPS.length}</small>
          </div>
          <button type="button" className="nr-tour-close" aria-label="使い方ガイドを閉じる" onClick={closeTour}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="nr-tour-progress" aria-hidden="true">
          <i style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }} />
        </div>

        <div className="nr-tour-copy" aria-live="polite">
          <h2 id="app-tour-title">{step.title}</h2>
          <p id="app-tour-description">{step.description}</p>
        </div>

        <footer className="nr-tour-actions">
          <button type="button" className="nr-tour-skip" onClick={closeTour}>スキップ</button>
          <div>
            <button
              type="button"
              className="nr-tour-back"
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
              disabled={stepIndex === 0}
            >
              <ArrowLeft size={14} aria-hidden="true" />戻る
            </button>
            <button
              ref={nextButtonRef}
              type="button"
              className="nr-tour-next"
              onClick={() => isLast ? closeTour() : setStepIndex((value) => Math.min(TOUR_STEPS.length - 1, value + 1))}
            >
              {isLast ? <><Check size={15} aria-hidden="true" />使ってみる</> : <>次へ<ArrowRight size={15} aria-hidden="true" /></>}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
