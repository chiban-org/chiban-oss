import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applicationParcels, applications } from '@/db/schema'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
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
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
let world: BoardWorld
let lw: ListWorld

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: LIST_NOW })
  world = await setupBoardWorld(h.db)
  await publishRegionalContacts(h.db, world)
  lw = await prepareListWorld(h.db, world)
  await issuedList()
})
afterAll(() => {
  vi.useRealTimers()
})

function parcelRefusal(variant: InvalidVariant) {
  return variant.field === 'applicationId'
    ? refuseField('applicationId', idMessage('an application'))
    : refuseField('parcelRef', textMessage('a parcel number or address', 200, variant))
}

describeActionCases(h, 'addApplicantParcelAction', {
  invoke: actions.addApplicantParcelAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ applicationId: lw.applicationId, parcelRef: lw.ids.E1 ?? '' }),
  fields: {
    applicationId: uuid({ required: true }),
    parcelRef: text({ required: true, max: 200 }),
  },
  capability: 'abutters.manage',
  refusals: { ...STAFF_REFUSALS, invalid: parcelRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Parcels for this application updated.' })
    expect(await applicantParcelIds(db, lw.applicationId, signal)).toContain(lw.ids.E1 ?? '')
    const rows = await db
      .select({ parcelId: applicationParcels.parcelId })
      .from(applicationParcels)
      .where(eq(applicationParcels.applicationId, lw.applicationId))
    expect(rows.length).toBeGreaterThanOrEqual(2)
  },
})

describe('addApplicantParcelAction with a parcel nobody has', () => {
  it('refuses beside the Parcel field and changes nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ applicationId: lw.applicationId, parcelRef: 'no such parcel' })
    const { value, written } = await h.recordWrites(() => actions.addApplicantParcelAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('parcelRef', 'That parcel ID was not found.'),
      written: [],
    })
  })
})

async function issuedList() {
  const made = await generateList(
    h.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error('generate failed')
  const issued = await issueList(h.db, world.staff, { listId: made.value.listId }, signal, LIST_NOW)
  if (!issued.ok) throw new Error(`issue failed ${JSON.stringify(issued.error)}`)
}

describeActionCases(h, 'terminateUnpaidAction', {
  invoke: actions.terminateUnpaidAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    applicationId: lw.applicationId,
    reason: 'Notice costs were not paid by the deadline.',
  }),
  fields: { applicationId: uuid({ required: true }), reason: text({ required: true, max: 1000 }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      variant.field === 'applicationId'
        ? refuseField('applicationId', idMessage('an application'))
        : refuseField('reason', textMessage('a reason', 1000, variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({
      ok: true,
      message: 'The application was ended for unpaid notice costs.',
    })
    const [app] = await db
      .select({ state: applications.state, closureReason: applications.closureReason })
      .from(applications)
      .where(eq(applications.id, lw.applicationId))
    expect(app).toEqual({ state: 'denied', closureReason: 'notice_costs_unpaid' })
  },
})
