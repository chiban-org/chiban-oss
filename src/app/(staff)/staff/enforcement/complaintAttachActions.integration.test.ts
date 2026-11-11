import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { complaints, enforcementCases } from '@/db/schema'
import { recordComplaint } from '@/features/enforcement/complaints'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { useEnforcementClock } from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./publishActions')

const h = actionHarness()
useEnforcementClock()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const caseRow = (id: string) =>
  h.db
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.id, id))
    .then((rows) => rows[0])

async function complaintOn(location: string) {
  const recorded = await recordComplaint(
    h.db,
    world.staff,
    { channel: 'staff_entry', locationText: location, description: 'Trucks idle all night.' },
    signal,
    FIXTURE_NOW,
  )
  if (!recorded.ok) throw new Error(recorded.error)
  return recorded.value
}

const forAttach = lazy(async () => {
  const target = await complaintOn('60 Maple Street')
  const moved = await complaintOn('60 Maple St')
  const shell = await caseRow(moved.caseId)
  return { caseId: target.caseId, moved, shellNumber: shell?.number ?? '' }
})

describeActionCases(h, 'attachComplaintAction', {
  invoke: actions.attachComplaintAction,
  actor: () => world.staff,
  input: async () => {
    const { caseId, moved } = await forAttach()
    return { caseId, complaintId: moved.complaintId }
  },
  fields: { caseId: uuid({ required: true }), complaintId: uuid({ required: true }) },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant: InvalidVariant) =>
      variant.field === 'caseId'
        ? refuseField('caseId', idMessage('a case'))
        : refuseField('complaintId', idMessage('a complaint')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    const { caseId, moved, shellNumber } = await forAttach()
    expect(result).toEqual({
      ok: true,
      message: `Complaint ${moved.number} attached. Case ${shellNumber} was closed.`,
    })
    const [row] = await db.select().from(complaints).where(eq(complaints.id, moved.complaintId))
    expect(row?.caseId).toBe(caseId)
  },
})

describe('attachComplaintAction on a complaint whose case has work', () => {
  it('refuses beside the complaint choice', async () => {
    h.signIn(world.staff)
    const target = await complaintOn('61 Maple Street')
    const other = await complaintOn('62 Maple Street')
    await h.db
      .update(enforcementCases)
      .set({ status: 'investigating' })
      .where(eq(enforcementCases.id, other.caseId))
    const copy =
      'That complaint is on a case that already has work recorded, so it cannot be moved.'
    expect(
      await actions.attachComplaintAction(
        h.form({ caseId: target.caseId, complaintId: other.complaintId }),
      ),
    ).toEqual(refuseField('complaintId', copy))
  })
})
