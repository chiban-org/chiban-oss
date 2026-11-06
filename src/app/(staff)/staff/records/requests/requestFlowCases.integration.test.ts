import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { rtkReleases, rtkRequests, rtkWithholdings } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { lazy } from '@/test/boardPanelFixtures'
import { seedParcelWorld } from '@/test/parcels'
import { dateCopy, textCopy, wholeNumberCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import { loggedRequest, RTK_TODAY, releasableRecord } from '@/test/rtkFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  int,
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
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const today = todayInTimeZone('America/New_York', RTK_TODAY)
const custodian = () => h.actorFor('records_custodian')
const newRequest = async () => await loggedRequest(h.db, await custodian())

const releasing = lazy(async () => {
  const requestId = await newRequest()
  const record = await releasableRecord(h.db, h.store, await custodian(), requestId)
  return { requestId, item: `${record.documentId}:${record.approvalId}`, record }
})

beforeAll(async () => {
  await seedParcelWorld(h.db)
  await releasing()
  vi.useFakeTimers({ toFake: ['Date'], now: RTK_TODAY })
})
afterAll(() => {
  vi.useRealTimers()
})

const EXPLANATION = 'The email is a confidential communication seeking legal advice.'

describeActionCases(h, 'withholdingAction', {
  invoke: actions.withholdingAction,
  actor: custodian,
  input: async () => ({
    requestId: await newRequest(),
    scope: 'withheld_in_full',
    recordDescription: 'Email from the town attorney',
    exemptionKey: 'nh.rtk.91a5.xii',
    explanation: EXPLANATION,
  }),
  fields: {
    requestId: uuid({ required: true }),
    scope: choice({ required: true }),
    recordDescription: text({ required: true, max: 1000 }),
    exemptionKey: choice({ required: true }),
    otherCitation: text({ max: 300 }),
    explanation: text({ required: true, max: 3000 }),
  },
  capability: 'rtk.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      requestId: 'Choose a request.',
      scope: 'Choose whether the record is withheld or redacted.',
      recordDescription: textCopy('which record', 1000),
      exemptionKey: 'Choose an exemption.',
      otherCitation: textCopy('the law', 300),
      explanation: textCopy('an explanation', 3000),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Withholding recorded.' })
    expect(written).toEqual(['audit_log', 'rtk_withholdings'])
    const rows = await db.select().from(rtkWithholdings)
    expect(rows.at(-1)).toMatchObject({ exemptionKey: 'nh.rtk.91a5.xii', explanation: EXPLANATION })
  },
})

describe('withholdingAction wording', () => {
  const attempt = async (extra: Record<string, string>) => {
    h.signIn(await custodian())
    return await actions.withholdingAction(
      h.form({
        requestId: await newRequest(),
        scope: 'redacted',
        recordDescription: 'Email from the town attorney',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: EXPLANATION,
        ...extra,
      }),
    )
  }

  it('says an explanation needs 20 characters, beside the explanation', async () => {
    expect(await attempt({ explanation: 'too short' })).toEqual(
      refuseField('explanation', 'Enter an explanation of at least 20 characters.'),
    )
  })

  it('asks for the law when another law makes the record confidential', async () => {
    expect(await attempt({ exemptionKey: 'other_law' })).toEqual(
      refuseField('otherCitation', 'Enter the law that makes the record confidential.'),
    )
    expect(await attempt({ exemptionKey: 'other_law', otherCitation: 'RSA 7:1' })).toMatchObject({
      ok: true,
    })
  })
})

describeActionCases(h, 'closeRequestAction', {
  invoke: actions.closeRequestAction,
  actor: custodian,
  input: async () => ({ requestId: await newRequest(), to: 'closed', expectedRowVersion: '1' }),
  fields: {
    requestId: uuid({ required: true }),
    to: choice({ required: true }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
  },
  capability: 'rtk.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      requestId: 'Choose a request.',
      to: 'Choose how to close it.',
      expectedRowVersion: wholeNumberCopy('the version of the request', 1, 2_147_483_647),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Request updated.' })
    expect(written).toEqual(['audit_log', 'rtk_requests'])
    const rows = await db.select().from(rtkRequests)
    expect(rows.find((r) => r.id === input.requestId)?.status).toBe('closed')
  },
})

describe('closeRequestAction versions', () => {
  it('says a stale version means the request changed', async () => {
    h.signIn(await custodian())
    const form = h.form({ requestId: await newRequest(), to: 'closed', expectedRowVersion: '9' })
    expect(await actions.closeRequestAction(form)).toEqual({
      ok: false,
      error: 'This record changed since you opened it. Reload the page and try again.',
    })
  })
})

const releaseInput = async (patch: Record<string, string | string[] | undefined> = {}) => {
  const { requestId, item } = await releasing()
  return {
    requestId,
    items: item,
    releasedOn: '2026-11-04',
    method: 'inspection',
    ...patch,
  }
}

describeActionCases(h, 'createReleaseAction', {
  invoke: actions.createReleaseAction,
  actor: custodian,
  input: releaseInput,
  fields: {
    requestId: uuid({ required: true }),
    releasedOn: date({ required: true, earliest: '1900-01-01', latest: today }),
    method: choice({ required: true }),
    recipientEmail: text({ max: 254 }),
  },
  capability: 'rtk.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      requestId: 'Choose a request.',
      releasedOn: dateCopy('the date released', today),
      method: 'Choose how the records are released.',
      recipientEmail: 'Enter an email address like name@example.com.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Records released.' })
    expect(written).toContain('rtk_releases')
    expect((await db.select().from(rtkReleases)).length).toBeGreaterThan(0)
  },
})

describe('createReleaseAction items and recipient', () => {
  const attempt = async (patch: Record<string, string | string[] | undefined>, check = false) => {
    h.signIn(await custodian())
    const form = h.form(await releaseInput(patch))
    if (check) form.set(CHECK_ONLY_FIELD, '1')
    return await h.recordWrites(() => actions.createReleaseAction(form))
  }
  const TICK_ONE = refuseField('items', 'Tick at least one approved record to release.')

  it('names the ticked records beside the list and writes nothing when none is ticked', async () => {
    const { value, written } = await attempt({ items: undefined })
    expect(value).toEqual(TICK_ONE)
    expect(written).toEqual([])
  })

  it('answers a check-only request with the same refusal so the confirm does not open first', async () => {
    expect((await attempt({ items: undefined }, true)).value).toEqual(TICK_ONE)
  })

  it('refuses a record that is not a document and approval pair', async () => {
    expect((await attempt({ items: 'not-a-pair' })).value).toEqual(
      refuseField('items', 'Choose approved records to release.'),
    )
  })

  it('asks for an email address when the release is a link', async () => {
    const { value, written } = await attempt({ method: 'electronic_link' })
    expect(value).toEqual(refuseField('recipientEmail', 'Enter the email address for the link.'))
    expect(written).toEqual([])
  })

  it('refuses a release dated before the request was received, beside the date', async () => {
    expect((await attempt({ releasedOn: '2026-10-01' })).value).toEqual(
      refuseField('releasedOn', 'The response date cannot be before the request was received.'),
    )
  })

  it('accepts two ticked records as a list', async () => {
    const { item } = await releasing()
    expect((await attempt({ items: [item] })).value).toMatchObject({ ok: true })
  })
})
