import type { z } from 'zod'
import type { ConfigKind } from '@/features/config/kinds'
import { MAX_FEE_CENTS, MAX_FEE_MULTIPLIER } from '@/features/fees/feeSchema'
import { words } from '@/lib/words'

type Issue = z.core.$ZodIssue

type Table = Partial<Record<ConfigKind, Readonly<Record<string, string>>>>

const NOUNS: Table = {
  application_type: {
    documents: 'a document',
    'documents.*.key': 'a short name for the document',
    'documents.*.label': 'the document name',
    'documents.*.stage': 'when the document is needed',
  },
  fee_schedule: {
    key: 'a short name',
    lines: 'a fee',
    'lines.*.code': 'a code for the fee',
    'lines.*.label': 'the name of the fee as it shows on the bill',
    'lines.*.due': 'when the fee is due',
    'lines.*.expr': 'the amount',
  },
  condition_library: {
    key: 'a short name',
    conditions: 'a condition',
    'conditions.*.code': 'a code for the condition',
    'conditions.*.text': 'the text of the condition',
  },
  form: {
    key: 'a short name',
    label: 'the form name',
    fields: 'a question',
    'fields.*.key': 'a short name for the question',
    'fields.*.label': 'the wording of the question',
    'fields.*.options': 'a choice',
    'fields.*.options.*.label': 'the wording of the choice',
    'fields.*.options.*.value': 'the stored value of the choice',
  },
  inspection_checklist: {
    key: 'a short name',
    label: 'the checklist name',
    inspectionType: 'the inspection type',
    items: 'a check',
    'items.*.label': 'the wording of the check',
    'items.*.key': 'a short name for the check',
  },
  inspection_settings: {
    schedulingDays: 'an inspection day',
    windowStartMinute: 'the time the first slot starts',
    windowEndMinute: 'the time the last slot ends',
    slotMinutes: 'the slot length in minutes',
    minNoticeDays: 'the days of notice before the first slot',
    horizonDays: 'the days ahead that can be booked',
    maxPerInspectorPerDay: 'the most inspections per inspector per day',
    'phoneRequestHours.days': 'a phone request day',
    'phoneRequestHours.startMinute': 'the time phone requests open',
    'phoneRequestHours.endMinute': 'the time phone requests close',
  },
  payment_settings: {
    'convenienceFee.basisPoints': 'the percent of the payment',
    'convenienceFee.fixedCents': 'the set amount',
    checksPayableTo: 'who checks are payable to',
    receiptFooter: 'the receipt footer',
  },
  board_settings: {
    boards: 'a board',
    'boards.*.boardId': 'the board',
    'boards.*.publicNotice.newspaper': 'the newspaper name',
    'boards.*.publicNotice.bulletinBoards': 'a bulletin board',
    'boards.*.publicNotice.bulletinBoards.*': 'the bulletin board name',
    'boards.*.publicNotice.websiteUrl': 'the notice web address',
    'boards.*.filingLeadDays': 'the filing deadline in days',
    'abutters.layersConfirmedBy': 'who confirmed the map layers',
    'abutters.layersConfirmedOn': 'the date the map layers were confirmed',
    'abutters.assumedRightOfWayFt': 'the assumed right of way in feet',
    'abutters.recheckContactsDays': 'the days before contacts are rechecked',
  },
  local_code_amendment: {
    title: 'a title',
    codeSection: 'the code section',
    adoptingAuthority: 'who adopted it',
    adoptedOn: 'the date it was adopted',
  },
  town_rule_setting: { value: "the town's value" },
  town_profile: {
    officeName: 'the office name',
    addressLines: 'an address line',
    phone: 'the phone number',
    email: 'the email address',
    website: 'the website',
    officeHours: 'the office hours',
    signers: 'a signer',
    'signers.*.name': 'the signer name',
    'signers.*.title': 'the signer title',
  },
}

const ROWS: Table = {
  application_type: { documents: 'Document' },
  fee_schedule: { lines: 'Fee' },
  condition_library: { conditions: 'Condition' },
  form: { fields: 'Question', 'fields.*.options': 'Choice' },
  inspection_checklist: { items: 'Check' },
  town_profile: { signers: 'Signer' },
  board_settings: { boards: 'Board', 'boards.*.publicNotice.bulletinBoards': 'Bulletin board' },
}

const RANGES: ReadonlyMap<string, string> = new Map([
  [
    'payment_settings:convenienceFee.basisPoints:too_small',
    'Enter the percent of the payment as 0 or more.',
  ],
  [
    'payment_settings:convenienceFee.basisPoints:too_big',
    'Enter the percent of the payment as 100 or less.',
  ],
  ['payment_settings:convenienceFee.fixedCents:too_small', 'Enter the set amount as 0 or more.'],
])

const CUSTOM: Readonly<Record<string, string>> = {
  'duplicate fee code': 'Two fees use the same code. Give each fee its own code.',
  'duplicate code': 'Two conditions use the same code. Give each condition its own code.',
  'duplicate key': 'Two questions use the same short name. Give each question its own.',
  'options required': 'Add at least one choice.',
  'duplicate document key': 'Two documents use the same short name. Give each document its own.',
}

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const DEFAULT_MESSAGE = /^(Too small|Too big|Invalid)\b/

function patternOf(path: readonly PropertyKey[]): string {
  return path.map((s) => (typeof s === 'number' ? '*' : String(s))).join('.')
}

function lookup(table: Table, kind: ConfigKind, key: string): string | undefined {
  return new Map(Object.entries(table[kind] ?? {})).get(key)
}

function rowPrefix(kind: ConfigKind, path: readonly PropertyKey[]): string {
  const parts: string[] = []
  path.forEach((segment, i) => {
    if (typeof segment !== 'number') return
    const row = lookup(ROWS, kind, patternOf(path.slice(0, i)))
    if (row !== undefined) parts.push(`${row} ${segment + 1}`)
  })
  return parts.length === 0 ? '' : `${parts.join(', ')}: `
}

function nounFor(kind: ConfigKind, path: readonly PropertyKey[]): string {
  let trimmed = path
  while (trimmed.length > 0) {
    const noun = lookup(NOUNS, kind, patternOf(trimmed))
    if (noun !== undefined) return noun
    trimmed = trimmed.slice(0, -1)
  }
  const leaf = [...path].reverse().find((s) => typeof s === 'string')
  return leaf === undefined ? 'this' : words(String(leaf)).toLowerCase()
}

function sentence(text: string): string {
  const first = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(first) ? first : `${first}.`
}

function authoredUnionMessage(issue: Extract<Issue, { code: 'invalid_union' }>): string | null {
  for (const errors of issue.errors) {
    const found = errors.find((e) => !DEFAULT_MESSAGE.test(e.message))
    if (found !== undefined) return found.message
  }
  return null
}

function bound(value: unknown): string {
  return typeof value === 'bigint' ? value.toString() : String(value)
}

function tooSmall(issue: Extract<Issue, { code: 'too_small' }>, noun: string): string {
  const min = bound(issue.minimum)
  if (issue.origin === 'array') {
    return Number(issue.minimum) <= 1 ? `Add ${noun}.` : `Add at least ${min} of these.`
  }
  if (issue.origin === 'string') {
    return Number(issue.minimum) <= 1
      ? `Enter ${noun}.`
      : `Enter ${noun} of at least ${min} characters.`
  }
  return issue.inclusive ? `Enter ${noun} of ${min} or more.` : `Enter ${noun} greater than ${min}.`
}

function tooBig(issue: Extract<Issue, { code: 'too_big' }>, noun: string): string {
  const max = bound(issue.maximum)
  if (issue.origin === 'string') return `Enter ${noun} of ${max} characters or fewer.`
  if (issue.origin === 'array') return `Choose no more than ${max} of these.`
  return issue.inclusive ? `Enter ${noun} of ${max} or less.` : `Enter ${noun} less than ${max}.`
}

function defaultBody(issue: Issue, noun: string): string {
  switch (issue.code) {
    case 'too_small':
      return tooSmall(issue, noun)
    case 'too_big':
      return tooBig(issue, noun)
    case 'invalid_type':
      return issue.expected === 'int' || issue.expected === 'safeint'
        ? `Enter ${noun} as a whole number.`
        : `Enter ${noun}.`
    case 'invalid_value':
      return `Choose ${noun}.`
    case 'invalid_union':
      return authoredUnionMessage(issue) ?? `Enter ${noun}.`
    case 'invalid_format':
      return issue.format === 'url'
        ? `Enter ${noun} as a web address starting with https://.`
        : `Enter ${noun} in the right form.`
    case 'custom':
    case 'invalid_element':
    case 'invalid_key':
    case 'not_multiple_of':
    case 'unrecognized_keys':
      return `Check ${noun}.`
  }
}

function feeBoundCopy(kind: ConfigKind, issue: Issue, path: readonly PropertyKey[]): string | null {
  if (kind !== 'fee_schedule' || issue.code !== 'too_big' || !path.includes('expr')) return null
  if (path.at(-1) === 'factor') return `Enter a multiplier of ${MAX_FEE_MULTIPLIER} or less.`
  return `Enter an amount of ${DOLLARS.format(MAX_FEE_CENTS / 100)} or less.`
}

function bodyOf(
  kind: ConfigKind,
  issue: Issue,
  noun: string,
  path: readonly PropertyKey[],
): string {
  if (issue.code === 'custom') return CUSTOM[issue.message] ?? sentence(issue.message)
  if (!DEFAULT_MESSAGE.test(issue.message)) return sentence(issue.message)
  const fee = feeBoundCopy(kind, issue, path)
  if (fee !== null) return fee
  const ranged = RANGES.get(`${kind}:${patternOf(path)}:${issue.code}`)
  return ranged ?? defaultBody(issue, noun)
}

export function configIssueCopy(kind: ConfigKind, issue: Issue): { path: string; message: string } {
  const noun = nounFor(kind, issue.path)
  return {
    path: issue.path.join('.'),
    message: `${rowPrefix(kind, issue.path)}${bodyOf(kind, issue, noun, issue.path)}`,
  }
}
