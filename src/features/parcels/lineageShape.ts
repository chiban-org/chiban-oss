import type { CivilDate } from '@/types/civilDate'

export type LineageKind = 'subdivision' | 'lot_line_adjustment' | 'merge'

export interface LineageInput {
  kind: LineageKind
  effectiveDate: CivilDate
  effectiveBasis: 'recording' | 'approval'
  reference?: string
  parents: string[]
  children: string[]
}

function distinct(ids: string[]): boolean {
  return new Set(ids).size === ids.length
}

export function hasValidShape(input: LineageInput): boolean {
  const { kind, parents, children } = input
  if (!distinct(parents) || !distinct(children)) return false
  if (kind === 'subdivision') return parents.length === 1 && children.length >= 2
  if (kind === 'merge') return parents.length >= 2 && children.length === 1
  const childSet = new Set(children)
  return (
    parents.length >= 2 &&
    parents.length === children.length &&
    parents.every((p) => childSet.has(p))
  )
}

export function retiredParents(input: LineageInput): string[] {
  const children = new Set(input.children)
  return input.parents.filter((p) => !children.has(p))
}
