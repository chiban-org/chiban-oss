import { activePack } from '@/features/packs/registry'
import type { BoardKind } from '@/features/packs/schema'

export function recordsLaw(): string {
  return activePack().labels.recordsLaw
}

export function recordsRequest(): string {
  return activePack().labels.recordsRequest
}

export function governingBody(): string {
  return activePack().labels.governingBody
}

export function boardLabel(kind: BoardKind): string {
  return activePack().boardKinds[kind].label
}

export function boardShort(kind: BoardKind): string {
  return activePack().boardKinds[kind].shortLabel
}

export function boardAbbrev(kind: BoardKind): string {
  return activePack().boardKinds[kind].abbreviation
}
