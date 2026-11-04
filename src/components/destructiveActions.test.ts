import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface FormTag {
  file: string
  line: number
  action: string
  label: string
  confirms: boolean
}

const SRC = path.resolve(__dirname, '..')

const DESTRUCTIVE_ACTIONS = [
  'voidAttemptAction',
  'recordOutcomeByHandAction',
  'approveDispositionAction',
  'cancelDispositionAction',
  'releaseHoldAction',
  'closeRequestAction',
  'revokeApprovalAction',
  'createReleaseAction',
  'endRestrictionAction',
  'disableAnonymousIntakeAction',
  'endDesignationAction',
  'disableAction',
  'sendResetAction',
  'resetAuthenticatorAction',
  'revokeInviteAction',
  'setTargetActiveAction',
  'excludeCandidateAction',
  'revokePacketLinkAction',
  'endMembershipAction',
  'cancelMeetingAction',
  'removeAgendaItemAction',
  'reopenAgendaAction',
  'terminateUnpaidAction',
  'transitionAction',
  'cancelInspectionAction',
  'revokeOverrideAction',
  'removeReviewerAction',
  'refundAction',
  'returnedCheckAction',
  'chargebackAction',
  'dissolveRestrainingOrderAction',
  'discardDraftOrderAction',
  'unpublishCaseAction',
  'dismissExceptionAction',
  'portalCancelInspectionAction',
  'actions.revoke',
  'props.actions.setPublic',
  'rollbackAction',
  'setCaseStatusAction',
  'recordDecisionAction',
  'completenessVoteAction',
]

const DESTRUCTIVE_WORDS =
  /\b(delete|remove|cancel|void|withdraw|revoke|disable|dismiss|end|deny|close|reject|unpublish|reset|restore|refund|discard|decline|dissolve|private|turn off|leave off|chargeback|returned)\b/i

const STAND_IN_PROCESSOR_PAGE = new Set(['declineCheckoutAction'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [full] : []
  })
}

function tagEnd(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i)
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0 && text.charAt(i - 1) !== '=') return i
  }
  return text.length
}

function formTags(file: string): FormTag[] {
  const text = readFileSync(file, 'utf8')
  const tags: FormTag[] = []
  let at = text.indexOf('<ActionForm')
  while (at !== -1) {
    const end = tagEnd(text, at)
    const tag = text.slice(at, end + 1).replace(/\s+/g, ' ')
    tags.push({
      file: path.relative(SRC, file),
      line: text.slice(0, at).split('\n').length,
      action: /\baction=\{([^}]+)\}/.exec(tag)?.[1]?.trim() ?? '',
      label: /submitLabel=(\{.*?\}|"[^"]*")/.exec(tag)?.[1] ?? '',
      confirms: /\bconfirm=\{/.test(tag),
    })
    at = text.indexOf('<ActionForm', end)
  }
  return tags
}

const TAGS = sourceFiles(SRC)
  .filter((file) => !file.endsWith(`${path.sep}ActionForm.tsx`))
  .flatMap(formTags)

const where = (t: FormTag) => `${t.file}:${String(t.line)} ${t.label}`

describe('destructive actions ask first', () => {
  it('finds every inventoried destructive action among the forms', () => {
    const found = new Set(TAGS.map((t) => t.action))
    expect(DESTRUCTIVE_ACTIONS.filter((a) => !found.has(a))).toEqual([])
  })

  it('passes confirm on every form that posts an inventoried destructive action', () => {
    const missing = TAGS.filter((t) => DESTRUCTIVE_ACTIONS.includes(t.action) && !t.confirms)
    expect(missing.map(where)).toEqual([])
  })

  it('passes confirm on every form whose submitLabel uses a destructive word (source scan)', () => {
    const missing = TAGS.filter(
      (t) =>
        DESTRUCTIVE_WORDS.test(t.label) && !t.confirms && !STAND_IN_PROCESSOR_PAGE.has(t.action),
    )
    expect(missing.map(where)).toEqual([])
  })
})
