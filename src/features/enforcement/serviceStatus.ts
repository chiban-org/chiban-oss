import type { CeaseAndDesistRule, RecipientRole } from '@packs/nh/schema'
import type { CivilDate } from '@/types/civilDate'

export type ServiceOutcome =
  | 'recipients_listed'
  | 'none_exist'
  | 'same_as_owner'
  | 'owner_not_found'
export type ServiceMethod =
  | 'in_hand'
  | 'abode'
  | 'other_civil_summons_method'
  | 'posting_on_property'
  | 'newspaper_publication'

export interface ServiceCheck {
  role: RecipientRole
  outcome: ServiceOutcome
}

export interface ServiceRecipient {
  id: string
  role: RecipientRole
}

export interface ServiceEvent {
  id: string
  recipientId: string | null
  method: ServiceMethod
  servedOn: CivilDate
}

export interface ServiceStatus {
  complete: boolean
  servedOn: Record<string, CivilDate>
  fallbackCompletedOn: CivilDate | null
  missing: { role: RecipientRole; reason: 'no_check' | 'unserved' | 'publication_incomplete' }[]
}

const MS_PER_DAY = 86_400_000
const DAYS_FROM_EPOCH_THURSDAY_TO_MONDAY = 3
const DAYS_PER_WEEK = 7

export function isoWeekIndex(date: CivilDate): number {
  const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY)
  return Math.floor((days + DAYS_FROM_EPOCH_THURSDAY_TO_MONDAY) / DAYS_PER_WEEK)
}

function earliestByRecipient(events: readonly ServiceEvent[]): Record<string, CivilDate> {
  const out: Record<string, CivilDate> = {}
  for (const e of events) {
    if (e.recipientId === null) continue
    const held = out[e.recipientId]
    if (held === undefined || e.servedOn < held) out[e.recipientId] = e.servedOn
  }
  return out
}

function firstInsertionPerWeek(events: readonly ServiceEvent[]): Map<number, CivilDate> {
  const byWeek = new Map<number, CivilDate>()
  for (const e of events) {
    if (e.method !== 'newspaper_publication') continue
    const week = isoWeekIndex(e.servedOn)
    const held = byWeek.get(week)
    if (held === undefined || e.servedOn < held) byWeek.set(week, e.servedOn)
  }
  return byWeek
}

function lastInsertionOfFirstRun(
  byWeek: Map<number, CivilDate>,
  weeks: number,
  latestInWeek: (week: number) => CivilDate,
): CivilDate | null {
  const sorted = [...byWeek.keys()].sort((a, b) => a - b)
  for (const start of sorted) {
    const run = Array.from({ length: weeks }, (_, i) => start + i)
    if (run.every((w) => byWeek.has(w))) return latestInWeek(start + weeks - 1)
  }
  return null
}

export function fallbackCompletion(
  rule: CeaseAndDesistRule,
  events: readonly ServiceEvent[],
): CivilDate | null {
  const postings = events
    .filter((e) => e.method === 'posting_on_property')
    .map((e) => e.servedOn)
    .sort()
  const posted = postings[0]
  if (rule.ownerNotFoundFallback.posting && posted === undefined) return null
  const byWeek = firstInsertionPerWeek(events)
  const latestInWeek = (week: number): CivilDate =>
    events
      .filter((e) => e.method === 'newspaper_publication' && isoWeekIndex(e.servedOn) === week)
      .map((e) => e.servedOn)
      .sort()
      .at(-1) as CivilDate
  const lastInsertion = lastInsertionOfFirstRun(
    byWeek,
    rule.ownerNotFoundFallback.publicationWeeks,
    latestInWeek,
  )
  if (lastInsertion === null) return null
  return posted !== undefined && posted > lastInsertion ? posted : lastInsertion
}

interface Input {
  checks: readonly ServiceCheck[]
  recipients: readonly ServiceRecipient[]
  events: readonly ServiceEvent[]
}

function nonOwnerMissing(
  rule: CeaseAndDesistRule,
  input: Input,
  own: Record<string, CivilDate>,
): ServiceStatus['missing'] {
  const missing: ServiceStatus['missing'] = []
  for (const role of rule.recipientRoles) {
    if (rule.ownerRoles.includes(role)) continue
    const check = input.checks.find((c) => c.role === role)
    if (check === undefined) missing.push({ role, reason: 'no_check' })
    else if (check.outcome === 'recipients_listed') {
      const listed = input.recipients.filter((r) => r.role === role)
      if (listed.length === 0 || listed.some((r) => own[r.id] === undefined)) {
        missing.push({ role, reason: 'unserved' })
      }
    }
  }
  return missing
}

function ownerMissing(
  rule: CeaseAndDesistRule,
  input: Input,
  own: Record<string, CivilDate>,
  fallbackCompletedOn: CivilDate | null,
): ServiceStatus['missing'] {
  const listedOwners = input.recipients.filter((r) => rule.ownerRoles.includes(r.role))
  const personallyServed =
    listedOwners.length > 0 && listedOwners.every((r) => own[r.id] !== undefined)
  const role = rule.ownerRoles[0] ?? 'record_owner'
  const fallbackCarries =
    fallbackCompletedOn !== null && input.recipients.some((r) => r.role === 'record_owner')
  if (personallyServed || fallbackCarries) return []
  if (fallbackCompletedOn !== null) return [{ role, reason: 'unserved' }]
  const ownerCheck = input.checks.find((c) => c.role === 'record_owner')
  if (ownerCheck?.outcome === 'owner_not_found') return [{ role, reason: 'publication_incomplete' }]
  if (ownerCheck === undefined && listedOwners.length === 0) return [{ role, reason: 'no_check' }]
  return [{ role, reason: 'unserved' }]
}

export function serviceStatus(rule: CeaseAndDesistRule, input: Input): ServiceStatus {
  const own = earliestByRecipient(input.events)
  const servedOn: Record<string, CivilDate> = { ...own }
  const fallbackOpen = input.checks.some(
    (c) => c.role === 'record_owner' && c.outcome === 'owner_not_found',
  )
  const fallbackCompletedOn = fallbackOpen ? fallbackCompletion(rule, input.events) : null
  if (fallbackCompletedOn !== null) {
    for (const r of input.recipients) {
      if (r.role === 'record_owner' && servedOn[r.id] === undefined)
        servedOn[r.id] = fallbackCompletedOn
    }
  }
  const missing = [
    ...nonOwnerMissing(rule, input, own),
    ...ownerMissing(rule, input, own, fallbackCompletedOn),
  ]
  return { complete: missing.length === 0, servedOn, fallbackCompletedOn, missing }
}
