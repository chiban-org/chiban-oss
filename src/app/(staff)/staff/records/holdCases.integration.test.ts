import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { legalHolds, recordEvents } from '@/db/schema'
import { placeHold } from '@/features/records/holds'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { dateCopy } from '@/test/recordsCases'
import { RECORDS_NOW } from '@/test/recordsClock'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const today = todayInTimeZone('America/New_York', RECORDS_NOW)
let world: PermitWorld
let applicationId = ''
let applicationNumber = ''

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  const app = await makeApplication(h.db, world)
  applicationId = app.applicationId
  applicationNumber = app.number
  vi.useFakeTimers({ toFake: ['Date'], now: RECORDS_NOW })
})
afterAll(() => {
  vi.useRealTimers()
})

const custodian = () => h.actorFor('records_custodian')
const REASON = 'Litigation pending on the site'
const REASON_COPY = {
  missing: 'Enter a reason.',
  whitespace: 'Enter a reason.',
  below_min: 'Enter a reason of at least 10 characters.',
  otherwise: 'Enter a reason of 2000 characters or fewer.',
}

describeActionCases(h, 'placeHoldAction', {
  invoke: actions.placeHoldAction,
  actor: custodian,
  input: () => ({ targetKind: 'application', targetRef: applicationNumber, reason: REASON }),
  fields: {
    targetKind: choice({ required: true }),
    targetRef: text({ max: 300 }),
    targetId: uuid(),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'hold.place_release',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      targetKind: 'Choose what to hold.',
      targetRef: 'Enter a reference of 300 characters or fewer.',
      targetId: 'Choose a record to hold.',
      reason: REASON_COPY,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Legal hold placed.' })
    expect(written).toEqual(['audit_log', 'legal_holds'])
    const holds = await db.select().from(legalHolds)
    expect(holds.at(-1)).toMatchObject({ targetKind: 'application', targetId: applicationId })
  },
})

describe('placeHoldAction reasons and references', () => {
  const attempt = async (patch: Record<string, string>, check = false) => {
    h.signIn(await custodian())
    const form = h.form({
      targetKind: 'application',
      targetRef: applicationNumber,
      reason: REASON,
      ...patch,
    })
    if (check) form.set(CHECK_ONLY_FIELD, '1')
    return await h.recordWrites(() => actions.placeHoldAction(form))
  }

  it('names the 10 character minimum beside the reason, in a check-only request too', async () => {
    const copy = refuseField('reason', 'Enter a reason of at least 10 characters.')
    expect((await attempt({ reason: 'short' })).value).toEqual(copy)
    expect((await attempt({ reason: 'short' }, true)).value).toEqual(copy)
  })

  it('asks for a reference beside the reference when none is given', async () => {
    const { value, written } = await attempt({ targetRef: '' })
    expect(value).toEqual(
      refuseField(
        'targetRef',
        'Enter the application number, case number, request number, project title, or document title.',
      ),
    )
    expect(written).toEqual([])
  })

  it('accepts a hidden record id in place of a typed reference', async () => {
    expect((await attempt({ targetRef: '', targetId: applicationId })).value).toMatchObject({
      ok: true,
    })
  })

  it('says no record has that reference, beside the reference', async () => {
    expect((await attempt({ targetRef: 'NOPE-0000' })).value).toEqual(
      refuseField('targetRef', 'No record was found with that reference.'),
    )
  })
})

const newHold = async () => {
  const placed = await placeHold(
    h.db,
    await custodian(),
    { target: { kind: 'application', id: applicationId }, reason: REASON },
    signal,
  )
  if (!placed.ok) throw new Error('hold')
  return placed.value.holdId
}

describeActionCases(h, 'releaseHoldAction', {
  invoke: actions.releaseHoldAction,
  actor: custodian,
  input: async () => ({ holdId: await newHold(), reason: 'The litigation was settled' }),
  fields: { holdId: uuid({ required: true }), reason: text({ required: true, max: 2000 }) },
  capability: 'hold.place_release',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ holdId: 'Choose a hold.', reason: REASON_COPY }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Legal hold released.' })
    expect(written).toEqual(['audit_log', 'legal_holds'])
    const holds = await db.select().from(legalHolds)
    expect(holds.find((x) => x.id === input.holdId)?.releaseReason).toBe(
      'The litigation was settled',
    )
  },
})

describe('releaseHoldAction reason before the confirm', () => {
  it('answers a check-only request with the short-reason refusal so no confirm opens first', async () => {
    h.signIn(await custodian())
    const form = h.form({ holdId: await newHold(), reason: 'short' })
    form.set(CHECK_ONLY_FIELD, '1')
    const { value, written } = await h.recordWrites(() => actions.releaseHoldAction(form))
    expect(value).toEqual(refuseField('reason', 'Enter a reason of at least 10 characters.'))
    expect(written).toEqual([])
  })

  it('says a hold that is already released cannot be found', async () => {
    h.signIn(await custodian())
    const holdId = await newHold()
    const release = () =>
      actions.releaseHoldAction(h.form({ holdId, reason: 'The litigation was settled' }))
    expect(await release()).toMatchObject({ ok: true })
    expect(await release()).toEqual({
      ok: false,
      error: 'No record was found with that reference.',
    })
  })
})

describeActionCases(h, 'recordBuildingRemovedAction', {
  invoke: actions.recordBuildingRemovedAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ projectId: world.projectId, occurredOn: '2027-02-20' }),
  fields: {
    projectId: uuid({ required: true }),
    occurredOn: date({ required: true, earliest: '1900-01-01', latest: today }),
  },
  capability: 'document.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      projectId: 'Choose a project.',
      occurredOn: dateCopy('the date the building was removed', today),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Removal recorded.' })
    expect(written).toEqual(['audit_log', 'record_events'])
    const events = await db.select().from(recordEvents)
    expect(events.at(-1)).toMatchObject({ kind: 'building_removed', occurredOn: '2027-02-20' })
  },
})

describe('recordBuildingRemovedAction project', () => {
  it('refuses a project that does not exist, beside the project', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({
      projectId: '00000000-0000-4000-8000-000000000000',
      occurredOn: '2027-02-20',
    })
    const { value, written } = await h.recordWrites(() => actions.recordBuildingRemovedAction(form))
    expect(value).toEqual(refuseField('projectId', 'That record was not found.'))
    expect(written).toEqual([])
  })
})
