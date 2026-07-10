# Design

## Visual Direction

Kinetic editorial dashboard. 深いブラックネイビーを土台に、コーラルレッドを判断・操作・重要シグナルのみに使う。夜の店舗情報を扱うが、安っぽいネオンや過剰グローには寄せない。

## Color

- Background: deep navy black, close to `#080A12`.
- Surface: tinted navy panels with low-contrast borders.
- Text: high contrast off-white, muted blue-gray for secondary text.
- Accent: coral red around `#F06457`, with softer peach only for highlights.
- Avoid: purple/blue AI gradients, pure black, orange-heavy accents, decorative grid backgrounds.

## Typography

- Japanese-first font stack: `Noto Sans JP`, `Hiragino Sans`, `Hiragino Kaku Gothic ProN`, `BIZ UDPGothic`, `Yu Gothic`, `Meiryo`, `sans-serif`.
- Data and compact labels use tabular numbers.
- Headings should be strong but not LP-scale inside the app.
- Cards and meters must avoid tiny unreadable numbers.

## Layout

- TOP is a decision surface, not a dashboard dump.
- First view contains three primary conclusions at most.
- Search, monitoring, and detailed evidence belong in lower panels or dedicated tabs.
- Store comparison uses full-width rows and readable evidence blocks before dense cards.
- Bottom navigation remains available on app pages.

## Components

- Buttons must look pressable, with visible hover/focus/active states.
- Meters should show both value and meaning; avoid small rings with cramped numbers.
- Radar/graph components should label stores directly enough that users do not need to cross-reference dots.
- Modals lock background scroll only while open and remain centered on mobile and desktop.

## Motion

Use motion for feedback and comprehension only: score transitions, selected states, small reveal of primary conclusions. Respect reduced motion. Avoid decorative particle or glow-heavy motion.
