import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { rtkRequests, rtkTimeStatements } from '@/db/schema'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { dateCopy, moneyCopy, textCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import { loggedRequest, RTK_TODAY } from '@/test/rtkFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  int,
  money,
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

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: RTK_TODAY })
  await seedParcelWorld(h.db)
})
afterAll(() => {
  vi.useRealTimers()
})

describeActionCases(h, 'logRequestAction', {
  invoke: actions.logRequestAction,
  actor: custodian,
  input: () => ({
    receivedOn: '2026-11-04',
    receivedVia: 'email',
    requesterName: 'Jordan Reyes',
    requesterContact: 'jordan@example.test',
    description: 'All permits on Birch Lane',
  }),
  fields: {
    receivedOn: date({ required: true, earliest: '1900-01-01', latest: today }),
    receivedVia: choice({ required: true }),
    requesterName: text({ max: 200 }),
    requesterContact: text({ max: 300 }),
    description: text({ required: true, max: 5000 }),
  },
  capability: 'rtk.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      receivedOn: dateCopy('the date received', today),
      receivedVia: 'Choose how it arrived.',
      requesterName: textCopy('the requester name', 200),
      requesterContact: textCopy('the requester contact', 300),
      description: textCopy('what was asked for', 5000),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Request logged.' })
    expect(written).toEqual(['application_number_counters', 'audit_log', 'rtk_requests'])
    const rows = await db.select().from(rtkRequests)
    expect(rows.at(-1)).toMatchObject({
      receivedOn: '2026-11-04',
      description: 'All permits on Birch Lane',
    })
  },
})

describe('logRequestAction descriptions', () => {
  it('names the description beside its field when it is only spaces or too long', async () => {
    h.signIn(await custodian())
    const attempt = (description: string) =>
      actions.logRequestAction(
        h.form({ receivedOn: '2026-11-04', receivedVia: 'email', description }),
      )
    expect(await attempt('     ')).toEqual(refuseField('description', 'Enter what was asked for.'))
    expect(await attempt('y'.repeat(5009))).toEqual(
      refuseField('description', 'Enter what was asked for of 5000 characters or fewer.'),
    )
  })
})

const STATED = {
  kind: 'time_statement',
  respondedOn: '2026-11-02',
  statedDate: '2026-11-20',
  delayReason: 'The records are in storage',
  costLabel: 'Copies',
  costDollars: '12.34',
}

describeActionCases(h, 'firstResponseAction', {
  invoke: actions.firstResponseAction,
  actor: custodian,
  input: async () => ({ requestId: await newRequest(), ...STATED }),
  fields: {
    requestId: uuid({ required: true }),
    kind: choice({ required: true }),
    respondedOn: date({ required: true, earliest: '1900-01-01', latest: today }),
    websiteUrl: text({ max: 500 }),
    statedDate: date(),
    delayReason: text({ max: 2000 }),
    costLabel: text({ max: 200 }),
    costDollars: money({ min: 1 }),
  },
  capability: 'rtk.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      requestId: 'Choose a request.',
      kind: 'Choose a response.',
      respondedOn: dateCopy('the date of the response', today),
      websiteUrl: 'Enter the web address of 500 characters or fewer.',
      statedDate: dateCopy('the date the town will respond by', today),
      delayReason: textCopy('a reason', 2000),
      costLabel: textCopy('a charge description', 200),
      costDollars: moneyCopy('the charge'),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Response recorded and the letter filed.' })
    expect(written).toEqual([
      'audit_log',
      'document_versions',
      'documents',
      'files',
      'preservation_records',
      'retention_assignments',
      'rtk_requests',
      'rtk_time_statements',
    ])
    const rows = await db.select().from(rtkTimeStatements)
    expect(rows.at(-1)).toMatchObject({
      requestId: input.requestId,
      costEstimate: [{ label: 'Copies', cents: 1234 }],
    })
  },
})

describe('firstResponseAction charge', () => {
  const respond = async (extra: Record<string, string | undefined>) => {
    h.signIn(await custodian())
    const form = h.form({ requestId: await newRequest(), ...STATED, ...extra })
    return await h.recordWrites(() => actions.firstResponseAction(form))
  }
  const withUrl = { kind: 'website_reference', websiteUrl: 'https://example.test/records' }
  const noMoreTime = {
    statedDate: undefined,
    delayReason: undefined,
    costLabel: undefined,
    costDollars: undefined,
  }

  it('prints the charge in the response letter and keeps it on the request', async () => {
    const requestId = await newRequest()
    h.signIn(await custodian())
    const form = h.form({ requestId, ...STATED })
    expect(await actions.firstResponseAction(form)).toMatchObject({ ok: true })
    const text = await pdfText(
      await buildResponseLetter(h.db, requestId, new AbortController().signal),
    )
    expect(text).toContain('Copies')
    expect(text).toContain('$12.34')
  })

  it('refuses a charge on a response that is not a time statement, beside the amount', async () => {
    const { value, written } = await respond({
      ...withUrl,
      statedDate: undefined,
      delayReason: undefined,
      costLabel: undefined,
    })
    expect(value).toEqual(
      refuseField(
        'costDollars',
        'A charge can only be stated with a response that asks for more time. Clear it or choose that response.',
      ),
    )
    expect(written).toEqual([])
  })

  it('refuses a charge description given without an amount, beside the amount', async () => {
    expect((await respond({ costDollars: undefined })).value).toEqual(
      refuseField('costDollars', 'Enter the charge.'),
    )
  })

  it('refuses an amount given without a description, beside the description', async () => {
    expect((await respond({ costLabel: undefined })).value).toEqual(
      refuseField('costLabel', 'Enter what the charge is for.'),
    )
  })

  it('accepts a time statement with no charge', async () => {
    expect((await respond({ costLabel: undefined, costDollars: undefined })).value).toMatchObject({
      ok: true,
    })
  })

  it('refuses a time statement with no date or no reason, beside each', async () => {
    expect((await respond({ statedDate: undefined })).value).toEqual(
      refuseField(
        'statedDate',
        'Enter a date on or after the response date for the time the town needs.',
      ),
    )
    expect((await respond({ delayReason: undefined })).value).toEqual(
      refuseField('delayReason', 'Enter why more time is needed.'),
    )
  })

  it('refuses a stated date before the response date', async () => {
    expect((await respond({ statedDate: '2026-11-01' })).value).toEqual(
      refuseField(
        'statedDate',
        'Enter a date on or after the response date for the time the town needs.',
      ),
    )
  })

  it('refuses a posted-online response without its address, and an address on another kind', async () => {
    expect((await respond({ ...withUrl, websiteUrl: undefined, ...noMoreTime })).value).toEqual(
      refuseField('websiteUrl', 'Enter the web address where the records are posted.'),
    )
    expect((await respond({ websiteUrl: 'https://example.test/x' })).value).toEqual(
      refuseField('websiteUrl', 'Leave this blank unless the records are posted online.'),
    )
    expect(
      (await respond({ ...withUrl, websiteUrl: 'not a web address', ...noMoreTime })).value,
    ).toEqual(refuseField('websiteUrl', 'Enter the web address starting with https://.'))
  })

  it('accepts a posted-online response', async () => {
    expect((await respond({ ...withUrl, ...noMoreTime })).value).toMatchObject({ ok: true })
  })

  it('says a denial needs a withholding first, beside the response choice', async () => {
    expect((await respond({ kind: 'denied', ...noMoreTime })).value).toEqual({
      ok: false,
      error: 'Record at least one withheld record with its exemption before denying a request.',
    })
  })
})
