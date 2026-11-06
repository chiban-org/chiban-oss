import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { boardMemberships, users } from '@/db/schema'
import { inviteBoardMember } from '@/features/boards/members'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type FieldSpec,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { updateMemberAction, endMembershipAction } = await import('./actions')

const h = actionHarness()

let membershipId = ''
const SEATED_EMAIL = 'seated@alderpond.example'

beforeAll(async () => {
  const invited = await inviteBoardMember(
    h.db,
    createMemoryTransport(),
    await h.actorFor('admin'),
    {
      displayName: 'Seated Member',
      email: SEATED_EMAIL,
      board: 'zba',
      title: 'member',
      termStart: '2026-11-01' as CivilDate,
    },
    new AbortController().signal,
  )
  if (!invited.ok) throw new Error(invited.error)
  const [row] = await h.db
    .select({ id: boardMemberships.id })
    .from(boardMemberships)
    .innerJoin(users, eq(users.id, boardMemberships.userId))
    .where(eq(users.email, SEATED_EMAIL))
  membershipId = row?.id ?? ''
})

const EMAIL: FieldSpec = {
  required: true,
  variants: [{ kind: 'words', label: 'without an at sign', value: 'notemail' }],
}

function updateRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'membershipId':
      return refuseField('membershipId', idMessage('a membership'))
    case 'displayName':
      return refuseField('displayName', textMessage('a name', 200, variant))
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

describeActionCases(h, 'updateMemberAction', {
  invoke: updateMemberAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    membershipId,
    displayName: 'Seated Member Jr',
    email: SEATED_EMAIL,
    board: 'zba',
    title: 'vice_chair',
    termStart: '2026-11-01',
    termEnd: '2029-10-31',
  }),
  fields: {
    membershipId: uuid({ required: true }),
    displayName: text({ required: true, max: 200 }),
    email: EMAIL,
    board: choice({ required: true }),
    title: choice({ required: true }),
    termStart: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    termEnd: date({ earliest: '1900-01-01', latest: '2099-12-31' }),
  },
  capability: 'board.manage_members',
  refusals: { ...STAFF_REFUSALS, invalid: updateRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Member saved.' })
    const [row] = await db
      .select({
        title: boardMemberships.title,
        termEnd: boardMemberships.termEnd,
        name: users.displayName,
      })
      .from(boardMemberships)
      .innerJoin(users, eq(users.id, boardMemberships.userId))
      .where(eq(boardMemberships.id, membershipId))
    expect(row).toEqual({ title: 'vice_chair', termEnd: '2029-10-31', name: 'Seated Member Jr' })
  },
})

describe('updateMemberAction with the term order from the forms sweep', () => {
  it('refuses a term ending before it starts beside the Term ends field and changes nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      membershipId,
      displayName: 'Seated Member Jr',
      email: SEATED_EMAIL,
      board: 'zba',
      title: 'member',
      termStart: '2026-11-01',
      termEnd: '2026-10-01',
    })
    const { value, written } = await h.recordWrites(() => updateMemberAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('termEnd', 'The term cannot end before it starts.'),
      written: [],
    })
  })
})

describeActionCases(h, 'endMembershipAction', {
  invoke: endMembershipAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ membershipId }),
  fields: { membershipId: uuid({ required: true }) },
  capability: 'board.manage_members',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('membershipId', idMessage('a membership')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Membership ended. Access stops now.' })
    const [row] = await db
      .select({ termEnd: boardMemberships.termEnd })
      .from(boardMemberships)
      .where(eq(boardMemberships.id, membershipId))
    expect(row?.termEnd).not.toBeNull()
  },
})
