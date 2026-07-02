'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export function NightRadarMotion() {
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (reduceMotion.matches) {
      return undefined
    }

    gsap.registerPlugin(ScrollTrigger)

    const root = document.querySelector<HTMLElement>('[data-motion-root]')
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const cleanups: Array<() => void> = []

    let lenis: Lenis | undefined
    let rafId = 0

    if (finePointer) {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
        wheelMultiplier: 0.84,
        touchMultiplier: 1,
      })

      lenis.on('scroll', ScrollTrigger.update)

      const raf = (time: number) => {
        lenis?.raf(time)
        rafId = requestAnimationFrame(raf)
      }

      rafId = requestAnimationFrame(raf)
    }

    if (root && finePointer) {
      const updateCursor = (event: PointerEvent) => {
        root.style.setProperty('--cursor-x', `${event.clientX}px`)
        root.style.setProperty('--cursor-y', `${event.clientY}px`)
      }

      window.addEventListener('pointermove', updateCursor, { passive: true })
      cleanups.push(() => window.removeEventListener('pointermove', updateCursor))
    }

    const ctx = gsap.context(() => {
      gsap.set('[data-reveal]', {
        autoAlpha: 0,
        filter: 'blur(12px)',
        y: 30,
      })

      gsap
        .timeline({
          defaults: {
            duration: 0.78,
            ease: 'power3.out',
          },
        })
        .to('[data-reveal="header"]', {
          autoAlpha: 1,
          filter: 'blur(0px)',
          y: 0,
        })
        .to(
          '[data-reveal="kicker"], [data-reveal="headline"], [data-reveal="lead"]',
          {
            autoAlpha: 1,
            filter: 'blur(0px)',
            stagger: 0.1,
            y: 0,
          },
          '-=0.42',
        )
        .to(
          '[data-reveal="hero-actions"], [data-reveal="stats"]',
          {
            autoAlpha: 1,
            filter: 'blur(0px)',
            stagger: 0.08,
            y: 0,
          },
          '-=0.34',
        )
        .fromTo(
          '[data-phone]',
          {
            autoAlpha: 0,
            rotate: -8,
            scale: 0.9,
            y: 48,
          },
          {
            autoAlpha: 1,
            duration: 1.05,
            ease: 'expo.out',
            rotate: 0,
            scale: 1,
            y: 0,
          },
          '-=0.5',
        )

      gsap.to('[data-phone]', {
        duration: 3.6,
        ease: 'sine.inOut',
        repeat: -1,
        rotate: 1.2,
        y: -13,
        yoyo: true,
      })

      gsap.to('[data-hero-brush]', {
        duration: 4.8,
        ease: 'sine.inOut',
        opacity: 0.92,
        repeat: -1,
        x: -22,
        yoyo: true,
      })

      gsap.to('[data-vertical-word]', {
        opacity: 0.82,
        scrollTrigger: {
          end: 'bottom top',
          scrub: 0.65,
          start: 'top top',
          trigger: '[data-hero]',
        },
        y: 92,
      })

      gsap.to('[data-hero-texture]', {
        backgroundPosition: '58% 50%',
        scrollTrigger: {
          end: 'bottom top',
          scrub: 0.7,
          start: 'top top',
          trigger: '[data-hero]',
        },
      })

      gsap.utils.toArray<HTMLElement>('[data-motion-section]').forEach((section) => {
        const intro = section.querySelector('[data-section-intro]')
        const items = section.querySelectorAll('[data-motion-item]')

        if (intro) {
          gsap.fromTo(
            intro,
            {
              autoAlpha: 0,
              filter: 'blur(10px)',
              x: -22,
            },
            {
              autoAlpha: 1,
              duration: 0.72,
              ease: 'power3.out',
              filter: 'blur(0px)',
              scrollTrigger: {
                start: 'top 78%',
                toggleActions: 'play none none reverse',
                trigger: section,
              },
              x: 0,
            },
          )
        }

        if (items.length > 0) {
          gsap.fromTo(
            items,
            {
              autoAlpha: 0,
              filter: 'blur(12px)',
              rotateX: 7,
              y: 36,
            },
            {
              autoAlpha: 1,
              duration: 0.72,
              ease: 'power3.out',
              filter: 'blur(0px)',
              rotateX: 0,
              scrollTrigger: {
                start: 'top 76%',
                toggleActions: 'play none none reverse',
                trigger: section,
              },
              stagger: 0.075,
              y: 0,
            },
          )
        }
      })

      gsap.utils.toArray<HTMLElement>('[data-motion-card]').forEach((card) => {
        gsap.to(card, {
          ease: 'none',
          scrollTrigger: {
            end: 'bottom 20%',
            scrub: true,
            start: 'top bottom',
            trigger: card,
          },
          y: -14,
        })
      })

      gsap.fromTo(
        '[data-chart-bar]',
        {
          scaleY: 0.12,
        },
        {
          duration: 0.88,
          ease: 'expo.out',
          scaleY: 1,
          scrollTrigger: {
            start: 'top 80%',
            toggleActions: 'play none none reverse',
            trigger: '[data-chart]',
          },
          stagger: 0.08,
          transformOrigin: 'bottom center',
        },
      )
    })

    if (finePointer) {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-spotlight-card]'))

      cards.forEach((card) => {
        const rotateX = gsap.quickTo(card, 'rotationX', {
          duration: 0.34,
          ease: 'power3.out',
        })
        const rotateY = gsap.quickTo(card, 'rotationY', {
          duration: 0.34,
          ease: 'power3.out',
        })

        const move = (event: PointerEvent) => {
          const rect = card.getBoundingClientRect()
          const x = event.clientX - rect.left
          const y = event.clientY - rect.top
          const px = x / rect.width - 0.5
          const py = y / rect.height - 0.5

          card.style.setProperty('--spot-x', `${x}px`)
          card.style.setProperty('--spot-y', `${y}px`)
          rotateX(py * -5)
          rotateY(px * 5)
        }

        const leave = () => {
          rotateX(0)
          rotateY(0)
        }

        card.addEventListener('pointermove', move, { passive: true })
        card.addEventListener('pointerleave', leave)
        cleanups.push(() => {
          card.removeEventListener('pointermove', move)
          card.removeEventListener('pointerleave', leave)
        })
      })
    }

    ScrollTrigger.refresh()

    return () => {
      ctx.revert()
      cleanups.forEach((cleanup) => cleanup())
      lenis?.destroy()

      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  return null
}
