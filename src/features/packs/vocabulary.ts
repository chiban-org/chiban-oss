import { activePack } from '@/features/packs/registry'
import { BOARD_KINDS, type BoardKind, type BoardKindNames } from '@/features/packs/schema'

export function recordsLaw(): string {
  return activePack().labels.recordsLaw
}

export function recordsRequest(): string {
  return activePack().labels.recordsRequest
}

export function acknowledgementEnabled(): boolean {
  return activePack().recordsRequests.acknowledgement
}

export function governingBody(): string {
  return activePack().labels.governingBody
}

export function rehearingWords(): { noun: string; capitalised: string } {
  return activePack().labels.rehearing
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

export interface Vocabulary {
  recordsLaw: string
  recordsRequest: string
  governingBody: string
  boardLabel: Readonly<Record<BoardKind, string>>
  boardShort: Readonly<Record<BoardKind, string>>
  boardAbbrev: Readonly<Record<BoardKind, string>>
}

function byBoard(pick: (names: BoardKindNames) => string): Record<BoardKind, string> {
  return Object.fromEntries(
    BOARD_KINDS.map((kind) => [kind, pick(activePack().boardKinds[kind])]),
  ) as Record<BoardKind, string>
}

export function packVocabulary(): Vocabulary {
  return {
    recordsLaw: recordsLaw(),
    recordsRequest: recordsRequest(),
    governingBody: governingBody(),
    boardLabel: byBoard((n) => n.label),
    boardShort: byBoard((n) => n.shortLabel),
    boardAbbrev: byBoard((n) => n.abbreviation),
  }
}
