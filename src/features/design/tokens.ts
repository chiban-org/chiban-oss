export const TOKENS = {
  canvas: '#f1f5f8',
  surface: '#ffffff',
  ink: '#1f1f1f',
  'ink-secondary': '#2d2f33',
  muted: '#5b6470',
  action: '#2a65a3',
  highlight: '#fff7ca',
  'status-passed-fg': '#1e6b3a',
  'status-passed-bg': '#e6f4ea',
  'status-failed-fg': '#a3261f',
  'status-failed-bg': '#fbe9e7',
  'status-overdue-fg': '#7a4b00',
  'status-overdue-bg': '#fff7ca',
  'status-neutral-fg': '#2d2f33',
  'status-neutral-bg': '#e8edf1',
  'map-parcel-line': '#2d2f33',
  'map-selected': '#2a65a3',
  'map-road': '#5b6470',
  'map-water-fill': '#d9e7f2',
  hairline: '#d5dce3',
  sidebar: '#e9eef2',
  'control-border': '#808a95',
} as const

export type TokenName = keyof typeof TOKENS

export const STATUSES = ['passed', 'failed', 'overdue', 'neutral'] as const
export type Status = (typeof STATUSES)[number]

export const LAYOUT = {
  radiusPx: 10,
  spaceBasePx: 4,
  cardPaddingPx: 24,
  contentMaxWidthPx: 1200,
  publicMinBodyPx: 16,
  publicMinTapTargetPx: 44,
  typeScaleRatio: 1.125,
} as const

const CHANNEL_MAX = 255
const LINEARIZE_THRESHOLD = 0.03928
const WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const

function channel(hex: string, start: number): number {
  const c = Number.parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX
  return c <= LINEARIZE_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  return WEIGHTS.r * channel(hex, 1) + WEIGHTS.g * channel(hex, 3) + WEIGHTS.b * channel(hex, 5)
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
