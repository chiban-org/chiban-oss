import type { ReactNode } from 'react'

export interface Panel {
  empty: boolean
  node: ReactNode
  key?: string
}

export interface PanelArrangement {
  lead: readonly string[]
  history: readonly string[]
}

function rendered(panels: readonly Panel[]): Panel[] {
  return panels.filter((p) => p.node !== null && p.node !== undefined && p.node !== false)
}

export function splitPanels(panels: readonly Panel[]): {
  filled: ReactNode[]
  empty?: ReactNode[]
} {
  const present = rendered(panels)
  const filled = present.filter((p) => !p.empty).map((p) => p.node)
  const empty = present.filter((p) => p.empty).map((p) => p.node)
  return empty.length === 0 ? { filled } : { filled, empty }
}

export function arrangePanels(
  panels: readonly Panel[],
  arrangement: PanelArrangement,
): { filled: ReactNode[]; history?: ReactNode[]; empty?: ReactNode[] } {
  const present = rendered(panels)
  const filled = present.filter((p) => !p.empty)
  const lead = arrangement.lead.flatMap((key) => filled.filter((p) => p.key === key))
  const rest = filled.filter((p) => !lead.includes(p))
  const folded = rest.filter((p) => p.key !== undefined && arrangement.history.includes(p.key))
  const main = rest.filter((p) => !folded.includes(p))
  const empty = present.filter((p) => p.empty).map((p) => p.node)
  return {
    filled: [...lead, ...main].map((p) => p.node),
    ...(folded.length === 0 ? {} : { history: folded.map((p) => p.node) }),
    ...(empty.length === 0 ? {} : { empty }),
  }
}
