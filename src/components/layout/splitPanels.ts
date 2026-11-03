import type { ReactNode } from 'react'

export interface Panel {
  empty: boolean
  node: ReactNode
}

export function splitPanels(panels: readonly Panel[]): {
  filled: ReactNode[]
  empty?: ReactNode[]
} {
  const present = panels.filter((p) => p.node !== null && p.node !== undefined && p.node !== false)
  const filled = present.filter((p) => !p.empty).map((p) => p.node)
  const empty = present.filter((p) => p.empty).map((p) => p.node)
  return empty.length === 0 ? { filled } : { filled, empty }
}
