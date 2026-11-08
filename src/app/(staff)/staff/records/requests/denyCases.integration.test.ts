import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { rtkRequests } from '@/db/schema'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import { dateCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import { loggedRequest, RTK_TODAY } from '@/test/rtkFixtures'
import {
  actionHarness,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const today = todayInTimeZone('America/New_York', RTK_TODAY)
const signal = new AbortController().signal
const custodian = () => h.actorFor('records_custodian')

async function timeStated(withheld = true): Promise<string> {
  const actor = await custodian()
  const requestId = await loggedRequest(h.db, actor)
  if (withheld) {
    await recordWithholding(
      h.db,
      actor,
      {
        requestId,
        scope: 'withheld_in_full',
        recordDescription: 'Email from the town attorney',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: 'The email is a confidential communication seeking legal advice.',
      },
      signal,
    )
  }
  await recordFirstResponse(
    h.db,
    h.store,
    actor,
    {
      requestId,
      kind: 'time_statement',
      respondedOn: '2026-11-03',
      timeStatement: {
        statedDate: '2026-11-20',
        delayReason: 'Review.',
        costEstimate: [],
      },
    },
    signal,
    RTK_TODAY,
  )
  return requestId
}

beforeAll(async () => {
  await seedParcelWorld(h.db)
  vi.useFakeTimers({ toFake: ['Date'], now: RTK_TODAY })
})

describeActionCases(h, 'denyRequestAction', {
  invoke: actions.denyRequestAction,
  actor: custodian,
  input: async () => ({ requestId: await timeStated(), deniedOn: today }),
  fields: {
    requestId: uuid({ required: true }),
    deniedOn: date({ required: true, earliest: '1900-01-01', latest: today }),
  },
  capability: 'rtk.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      requestId: 'Choose a request.',
      deniedOn: dateCopy('the date of the denial', today),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Denial recorded and the letter filed.' })
    const [row] = await db
      .select()
      .from(rtkRequests)
      .where(eq(rtkRequests.id, String(input.requestId)))
    expect(row?.status).toBe('responded')
    expect(row?.deniedOn).toBe(today)
  },
})

describe('denyRequestAction refusals', () => {
  it('names the withholding rule when nothing is withheld', async () => {
    h.signIn(await custodian())
    const form = h.form({ requestId: await timeStated(false), deniedOn: today })
    expect(await actions.denyRequestAction(form)).toEqual({
      ok: false,
      error: 'Record at least one withheld record with its exemption before denying a request.',
    })
  })

  it('refuses a date before the time statement beside the date', async () => {
    h.signIn(await custodian())
    const form = h.form({ requestId: await timeStated(), deniedOn: '2026-11-02' })
    expect(await actions.denyRequestAction(form)).toEqual(
      refuseField('deniedOn', 'The denial date cannot be before the time statement.'),
    )
  })
})
