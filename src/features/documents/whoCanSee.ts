import type { RenditionState } from '@/features/documents/panelData'
import { AUDIENCES, type Audience, type RecordKind } from '@/features/documents/types'
import { parcelPublicHref } from '@/features/publicSite/publicHref'

export interface VisibilityInput {
  recordKind: RecordKind
  audiences: Audience[]
  isPublic: boolean
  rendition: RenditionState
  approvedRole: string | null
  caseIsPublic: boolean | null
  parcelId: string | null
}

export type Blocker =
  | 'kind_never'
  | 'no_approved_copy'
  | 'redacted_waiting'
  | 'revoked'
  | 'case_private'

export type PublicState =
  | { shown: true; copy: 'original' | 'redacted'; parcelId: string | null }
  | { shown: false; switchOn: boolean; blockers: Blocker[] }

export type ChipStatus = 'passed' | 'failed' | 'overdue' | 'neutral'

const AUDIENCES_BY_KIND: ReadonlyMap<RecordKind, readonly Audience[]> = new Map([
  ['application', ['project_parties', 'reviewers', 'board']],
  ['project', ['project_parties', 'reviewers']],
  ['inspection', ['project_parties']],
  ['meeting', ['board']],
])

const AUDIENCE_WORDS: ReadonlyMap<Audience, string> = new Map([
  ['project_parties', 'project parties'],
  ['reviewers', 'assigned reviewers'],
  ['board', 'board members'],
])

export function audiencesFor(kind: RecordKind): Audience[] {
  return [...(AUDIENCES_BY_KIND.get(kind) ?? [])]
}

function approvalBlocker(rendition: RenditionState): Blocker | null {
  if (rendition === 'approved') return null
  if (rendition === 'redacted_waiting') return 'redacted_waiting'
  if (rendition === 'revoked') return 'revoked'
  return 'no_approved_copy'
}

function copyOf(approvedRole: string | null): 'original' | 'redacted' {
  return approvedRole === 'public_redacted' ? 'redacted' : 'original'
}

export function publicStateOf(doc: VisibilityInput): PublicState {
  if (doc.recordKind === 'rtk_request') {
    return { shown: false, switchOn: doc.isPublic, blockers: ['kind_never'] }
  }
  const blockers: Blocker[] = []
  const approval = approvalBlocker(doc.rendition)
  if (approval !== null) blockers.push(approval)
  if (doc.recordKind === 'enforcement_case' && doc.caseIsPublic !== true) {
    blockers.push('case_private')
  }
  if (doc.isPublic && blockers.length === 0) {
    return { shown: true, copy: copyOf(doc.approvedRole), parcelId: doc.parcelId }
  }
  return { shown: false, switchOn: doc.isPublic, blockers }
}

function joinWords(words: string[], last: string): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')}${last}${words.at(-1) ?? ''}`
}

function whoPart(doc: VisibilityInput): string {
  const applicable = audiencesFor(doc.recordKind)
  const granted = AUDIENCES.filter((a) => doc.audiences.includes(a) && applicable.includes(a))
  if (granted.length === 0) return 'Town staff only.'
  const names = granted.map((a) => AUDIENCE_WORDS.get(a) ?? a)
  return `${joinWords(['Town staff', ...names], ' and ')}.`
}

const BLOCKER_WORDS: ReadonlyMap<Blocker, string> = new Map([
  ['no_approved_copy', 'no copy is approved for the public yet'],
  ['redacted_waiting', 'the redacted copy is waiting for approval'],
  ['revoked', 'the public approval was revoked'],
  ['case_private', 'the case is not public'],
])

const COPY_WORDS = { original: 'the original', redacted: 'the redacted copy' } as const

function hiddenPart(doc: VisibilityInput, blockers: Blocker[]): string {
  if (blockers.includes('kind_never')) {
    return 'Not on the public site: Right-to-Know documents are never shown there.'
  }
  if (blockers.length === 0) {
    const copy = COPY_WORDS[copyOf(doc.approvedRole)]
    return `Not on the public site. ${copy.charAt(0).toUpperCase()}${copy.slice(1)} is approved for the public, so it can be shown.`
  }
  const words = blockers.flatMap((b) => {
    const said = BLOCKER_WORDS.get(b)
    return said === undefined ? [] : [said]
  })
  return `Not on the public site: ${joinWords(words, ', and ')}.`
}

export function whoCanSeeSentence(doc: VisibilityInput): string {
  const state = publicStateOf(doc)
  if (!state.shown) return `${whoPart(doc)} ${hiddenPart(doc, state.blockers)}`
  const copy = COPY_WORDS[state.copy]
  if (state.parcelId === null) {
    return `Everyone. Shown on the public site only through its link, as ${copy}: the record has no parcel, so no parcel page lists it.`
  }
  return `Everyone. Shown on the public site on the parcel page, as ${copy}.`
}

export function publicChip(doc: VisibilityInput): { status: ChipStatus; label: string } {
  const state = publicStateOf(doc)
  if (state.shown) return { status: 'passed', label: 'Shown on the public site' }
  const label = 'Not on the public site'
  if (state.blockers.includes('kind_never')) return { status: 'neutral', label }
  if (state.switchOn) return { status: 'failed', label }
  if (state.blockers.includes('redacted_waiting')) return { status: 'overdue', label }
  return { status: 'neutral', label }
}

export function publicViewHref(doc: VisibilityInput): string | null {
  const state = publicStateOf(doc)
  return state.shown && state.parcelId !== null ? parcelPublicHref(state.parcelId) : null
}

export function showNote(doc: VisibilityInput): string {
  const where =
    doc.parcelId === null ? 'to anyone with its link' : 'to signed-out visitors on the parcel page'
  const gate = doc.recordKind === 'enforcement_case' ? ', only while the case is public' : ''
  const tail = doc.parcelId === null ? ' The record has no parcel, so no public page lists it.' : ''
  return `Shows the approved copy ${where}${gate}.${tail}`
}
