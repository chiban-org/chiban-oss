import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { ROLES } from '@/constants/roles'
import { boardMeetings, documents, meetingMinutes } from '@/db/schema'
import { createUploadIntent } from '@/features/documents/uploads'
import { errorCopy } from '@/server/actionRunner'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { setupBoardWorld } from '@/test/boardFixtures'
import { lazy } from '@/test/boardPanelFixtures'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  int,
  isPublicRole,
  type Refusals,
  rolesLacking,
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
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./minutesActions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal

const HELD = '2026-04-08'
const FULL_RANGE = { earliest: '1900-01-01', latest: '2099-12-31' }
let meetingId = ''

beforeAll(async () => {
  await setupBoardWorld(h.db, { pbMeetings: [HELD] })
  const [row] = await h.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(eq(boardMeetings.meetingDate, HELD))
  meetingId = row?.id ?? ''
})

type IntentOutcome = Awaited<ReturnType<typeof actions.createMeetingUploadIntentAction>>

function failure(code: string): IntentOutcome {
  return { ok: false, error: errorCopy(code) }
}

const INTENT_REFUSALS: Refusals<IntentOutcome> = {
  csrf: failure('csrf'),
  signedOut: failure('signed_out'),
  forbidden: (role: Role) => failure(isPublicRole(role) ? 'signed_out' : 'forbidden'),
  invalid: failure('invalid_input'),
  checkOnly: failure('check_unsupported'),
}

const SIZE_RANGE = 'as a whole number from 0 to 9007199254740991.'

function intentRefusal(variant: InvalidVariant): IntentOutcome {
  const error = (message: string): IntentOutcome => ({ ok: false, error: message })
  switch (variant.field) {
    case 'targetId':
      return error(idMessage('a meeting'))
    case 'title':
      return error(textMessage('a title', 200, variant))
    case 'filename':
      return error(textMessage('a file name', 255, variant))
    case 'contentType':
      return error(textMessage('a file type', 100, variant))
    default:
      return error(
        variant.kind === 'missing' ? 'Enter the file size.' : `Enter the file size ${SIZE_RANGE}`,
      )
  }
}

describeActionCases(h, 'createMeetingUploadIntentAction', {
  invoke: actions.createMeetingUploadIntentAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    targetId: meetingId,
    title: 'Minutes of April 8',
    filename: 'minutes.pdf',
    contentType: 'application/pdf',
    sizeBytes: String(pdfBytes('minutes').length),
  }),
  fields: {
    targetId: uuid({ required: true }),
    title: text({ max: 200 }),
    filename: text({ required: true, max: 255 }),
    contentType: text({ required: true, max: 100 }),
    sizeBytes: int({ required: true, min: 0 }),
  },
  capability: 'board.record',
  refusals: { ...INTENT_REFUSALS, invalid: intentRefusal, checkOnly: INTENT_REFUSALS.checkOnly },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({
      ok: true,
      intentId: expect.any(String),
      url: expect.stringContaining('http'),
    })
    expect(written).toContain('upload_intents')
  },
})

const pendingIntent = lazy(async () => {
  const intent = await createUploadIntent(
    h.db,
    h.store,
    await h.actorFor('admin'),
    {
      target: { kind: 'meeting', id: meetingId },
      title: 'Minutes to finalize',
      filename: 'finalize.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdfBytes('finalize').length,
    },
    signal,
  )
  if (!intent.ok) throw new Error(intent.error)
  const put = await fetch(intent.value.url, {
    method: 'PUT',
    headers: intent.value.headers,
    body: new Blob([pdfBytes('finalize')]),
  })
  if (!put.ok) throw new Error(`put ${put.status}`)
  return intent.value.intentId
})

describeActionCases(h, 'finalizeMeetingUploadAction', {
  invoke: actions.finalizeMeetingUploadAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ intentId: await pendingIntent() }),
  fields: { intentId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('intentId', idMessage('an upload')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Uploaded. Choose it below to record it as the minutes.',
    })
    const rows = await db
      .select({ title: documents.title })
      .from(documents)
      .where(eq(documents.recordId, meetingId))
    expect(rows.map((r) => r.title)).toContain('Minutes to finalize')
  },
})

const minutesDocument = lazy(
  async () =>
    (
      await uploadAs(
        h.db,
        h.store,
        await h.actorFor('staff'),
        { kind: 'meeting', id: meetingId },
        pdfBytes('record minutes'),
        { title: 'Minutes of April 8', filename: 'minutes.pdf' },
      )
    ).documentId,
)

function minutesRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'meetingId':
      return refuseField('meetingId', idMessage('a meeting'))
    case 'documentId':
      return refuseField('documentId', idMessage('the minutes'))
    case 'status':
      return refuseField('status', 'Choose a status.')
    default:
      return refuseField('approvedOn', dateMessage('the date approved', variant))
  }
}

async function minutesInput(status: string, approvedOn = '') {
  return { meetingId, documentId: await minutesDocument(), status, approvedOn }
}

describe('recordMinutesAction with the approval dates the feature refuses', () => {
  it('refuses an approval with no date beside the Date approved field', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form(await minutesInput('approved'))
    const { value, written } = await h.recordWrites(() => actions.recordMinutesAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('approvedOn', 'Enter the date the board approved the minutes.'),
      written: [],
    })
  })

  it('refuses an approval before the meeting beside the Date approved field', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await actions.recordMinutesAction(
      h.form(await minutesInput('approved', '2026-04-01')),
    )
    expect(result).toEqual(
      refuseField('approvedOn', 'The minutes cannot be approved before the meeting was held.'),
    )
  })

  it('refuses an approval after today beside the Date approved field', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await actions.recordMinutesAction(
      h.form(await minutesInput('approved', '2099-01-01')),
    )
    expect(result).toEqual(refuseField('approvedOn', 'The approval date cannot be in the future.'))
  })

  it('records a draft without a date and keeps it out of public view', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.recordMinutesAction(h.form(await minutesInput('draft')))
    expect(result).toEqual({
      ok: true,
      message: 'Draft minutes recorded. They are not public.',
    })
    const [row] = await h.db
      .select({ status: meetingMinutes.status })
      .from(meetingMinutes)
      .where(eq(meetingMinutes.meetingId, meetingId))
    expect(row).toEqual({ status: 'draft' })
  })
})

describeActionCases(h, 'recordMinutesAction', {
  invoke: actions.recordMinutesAction,
  actor: () => h.actorFor('staff'),
  input: () => minutesInput('approved', '2026-04-10'),
  fields: {
    meetingId: uuid({ required: true }),
    documentId: uuid({ required: true }),
    status: choice({ required: true }),
    approvedOn: date(FULL_RANGE),
  },
  refusedRoles: ROLES.filter(
    (role) =>
      rolesLacking('board.record').includes(role) ||
      rolesLacking('document.publish').includes(role),
  ),
  refusals: { ...STAFF_REFUSALS, invalid: minutesRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Approved minutes recorded. They are now public.',
    })
    const [row] = await db
      .select({ status: meetingMinutes.status, approvedOn: meetingMinutes.approvedOn })
      .from(meetingMinutes)
      .where(eq(meetingMinutes.meetingId, meetingId))
    expect(row).toEqual({ status: 'approved', approvedOn: '2026-04-10' })
  },
})
