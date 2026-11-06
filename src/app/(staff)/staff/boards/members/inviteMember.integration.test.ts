import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { boardMemberships, users } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type FieldSpec,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { inviteMemberAction } = await import('./actions')

const h = actionHarness()

let invited = 0
function nextEmail(): string {
  invited += 1
  return `member${invited}@alderpond.example`
}

const EMAIL: FieldSpec = {
  required: true,
  variants: [{ kind: 'words', label: 'without an at sign', value: 'notemail' }],
}

const DATE_RANGE = 'between January 1, 1900 and December 31, 2099.'

function dateMessage(noun: string, variant: InvalidVariant): string {
  if (variant.kind === 'missing') return `Enter ${noun}.`
  if (variant.kind === 'too_early' || variant.kind === 'too_late')
    return `Enter ${noun} ${DATE_RANGE}`
  return `Enter ${noun} as a date.`
}

function refusalFor(variant: InvalidVariant) {
  switch (variant.field) {
    case 'displayName':
      return refuseField('displayName', 'Enter a name of 200 characters or fewer.')
    case 'email':
      return refuseField(
        'email',
        variant.kind === 'missing'
          ? 'Enter an email address.'
          : 'Enter an email address like name@example.com.',
      )
    case 'board':
      return refuseField('board', 'Choose a board.')
    case 'title':
      return refuseField('title', 'Choose a role on the board.')
    case 'termStart':
      return refuseField('termStart', dateMessage('the term start date', variant))
    default:
      return refuseField('termEnd', dateMessage('the term end date', variant))
  }
}

describeActionCases(h, 'inviteMemberAction', {
  invoke: inviteMemberAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    displayName: 'Avery Stone',
    email: nextEmail(),
    board: 'zba',
    title: 'member',
    termStart: '2026-11-01',
    termEnd: '2029-10-31',
  }),
  fields: {
    displayName: text({ max: 200 }),
    email: EMAIL,
    board: choice({ required: true }),
    title: choice({ required: true }),
    termStart: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    termEnd: date({ earliest: '1900-01-01', latest: '2099-12-31' }),
  },
  capability: 'board.manage_members',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Member added. They were emailed how to sign in.' })
    expect(written).toEqual(['audit_log', 'board_memberships', 'user_roles', 'users'])
    expect(h.mail.sent.map((m) => m.to)).toEqual([input.email])
    const [membership] = await db
      .select({ termStart: boardMemberships.termStart, termEnd: boardMemberships.termEnd })
      .from(boardMemberships)
      .innerJoin(users, eq(users.id, boardMemberships.userId))
      .where(eq(users.email, input.email))
    expect(membership).toEqual({ termStart: '2026-11-01', termEnd: '2029-10-31' })
  },
})

describe('inviteMemberAction with the term order from the forms sweep', () => {
  it('refuses a term ending before it starts beside the Term ends field, adds nobody and sends nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      displayName: 'Avery Stone',
      email: nextEmail(),
      board: 'zba',
      title: 'member',
      termStart: '2026-11-01',
      termEnd: '2026-10-01',
    })
    const { value, written } = await h.recordWrites(() => inviteMemberAction(form))
    expect({ value, written, mailed: h.mail.sent.length }).toEqual({
      value: refuseField('termEnd', 'The term cannot end before it starts.'),
      written: [],
      mailed: 0,
    })
  })
})
