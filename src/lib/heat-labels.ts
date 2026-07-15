export const heatLabels = [
  {
    rank: 1,
    key: 'blazing',
    emoji: '🔥',
    label: 'アツすぎて滅',
    description: '上位3店舗の中で最も投稿の動きが強い状態',
  },
  {
    rank: 2,
    key: 'hype',
    emoji: '🚀',
    label: 'テンアゲ',
    description: '上位3店舗の中で投稿の動きが強い状態',
  },
  {
    rank: 3,
    key: 'warming',
    emoji: '👀',
    label: 'じわアツ',
    description: '上位3店舗の中で動きを確認できる状態',
  },
] as const

export type HeatLabel = (typeof heatLabels)[number]

export function heatLabelForRank(rank: number): HeatLabel | null {
  return heatLabels.find((item) => item.rank === rank) ?? null
}

export function formatHeatLabel(rank: number) {
  const heat = heatLabelForRank(rank)
  return heat ? `${heat.emoji} ${heat.label}` : ''
}
