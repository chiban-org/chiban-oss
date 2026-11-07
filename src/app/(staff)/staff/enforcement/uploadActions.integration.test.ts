import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { documents } from '@/db/schema'
import { createUploadIntent } from '@/features/documents/uploads'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { pdfBytes } from '@/test/documentFixtures'
import { intakeCase } from '@/test/enforcementActionFixtures'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import {
  actionHarness,
  choice,
  describeActionCases,
  type InvalidVariant,
  int,
  isPublicRole,
  type Refusals,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./uploadActions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

type IntentOutcome = Awaited<ReturnType<typeof actions.createCaseUploadIntentAction>>

const failure = (error: string): IntentOutcome => ({ ok: false, error })
const CANNOT_ADD = 'You cannot add files to this case.'
const SIZE_RANGE = 'as a whole number from 0 to 9007199254740991.'

const INTENT_REFUSALS: Refusals<IntentOutcome> = {
  csrf: failure(errorCopy('csrf')),
  signedOut: failure(errorCopy('signed_out')),
  forbidden: (role: Role) => failure(isPublicRole(role) ? errorCopy('signed_out') : CANNOT_ADD),
  invalid: failure(errorCopy('invalid_input')),
  checkOnly: failure(errorCopy('check_unsupported')),
}

function intentRefusal(variant: InvalidVariant): IntentOutcome {
  switch (variant.field) {
    case 'targetId':
      return failure(idMessage('a case'))
    case 'docKind':
      return failure('Choose a kind of document.')
    case 'title':
      return failure(textMessage('a title', 300, variant))
    case 'filename':
      return failure(textMessage('a file name', 255, variant))
    case 'contentType':
      return failure(textMessage('a file type', 100, variant))
    default:
      return failure(
        variant.kind === 'missing' ? 'Enter the file size.' : `Enter the file size ${SIZE_RANGE}`,
      )
  }
}

const forIntent = lazy(() => intakeCase(h.db, world, '101 Hickory Lane'))

describeActionCases(h, 'createCaseUploadIntentAction', {
  invoke: actions.createCaseUploadIntentAction,
  actor: () => world.staff,
  input: async () => ({
    targetId: (await forIntent()).caseId,
    docKind: 'enforcement_photo',
    title: 'Front of the property',
    filename: 'front.pdf',
    contentType: 'application/pdf',
    sizeBytes: String(pdfBytes('front').length),
  }),
  fields: {
    targetId: uuid({ required: true }),
    docKind: choice({ required: true }),
    title: text({ max: 300 }),
    filename: text({ required: true, max: 255 }),
    contentType: text({ required: true, max: 100 }),
    sizeBytes: int({ required: true, min: 0 }),
  },
  capability: ['enforcement.manage', 'enforcement.record_service'],
  refusals: { ...INTENT_REFUSALS, invalid: intentRefusal },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({
      ok: true,
      intentId: expect.any(String),
      url: expect.stringContaining('http'),
    })
    expect(written).toContain('upload_intents')
  },
})

describe('createCaseUploadIntentAction beyond the table', () => {
  it('says which file types are allowed for a text file and records no intent', async () => {
    h.signIn(world.staff)
    const { caseId } = await forIntent()
    const { value, written } = await h.recordWrites(() =>
      actions.createCaseUploadIntentAction(
        h.form({
          targetId: caseId,
          docKind: 'enforcement_letter',
          title: 'Notes',
          filename: 'notes.txt',
          contentType: 'text/plain',
          sizeBytes: '12',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: failure('Upload a PDF, JPEG, or PNG file.'),
      written: [],
    })
  })
})

const pendingIntent = lazy(async () => {
  const { caseId } = await forIntent()
  const bytes = pdfBytes('finalize')
  const intent = await createUploadIntent(
    h.db,
    h.store,
    world.staff,
    {
      target: { kind: 'enforcement_case', id: caseId },
      title: 'Letter to finalize',
      filename: 'finalize.pdf',
      contentType: 'application/pdf',
      sizeBytes: bytes.length,
      docKind: 'enforcement_letter',
    },
    signal,
  )
  if (!intent.ok) throw new Error(intent.error)
  const put = await fetch(intent.value.url, {
    method: 'PUT',
    headers: intent.value.headers,
    body: new Blob([bytes]),
  })
  if (!put.ok) throw new Error(`put ${put.status}`)
  return intent.value.intentId
})

describeActionCases(h, 'finalizeCaseUploadAction', {
  invoke: actions.finalizeCaseUploadAction,
  actor: () => world.staff,
  input: async () => ({ intentId: await pendingIntent() }),
  fields: { intentId: uuid({ required: true }) },
  capability: ['enforcement.manage', 'enforcement.record_service'],
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: (role: Role): ActionResult => ({
      ok: false,
      error: isPublicRole(role) ? errorCopy('signed_out') : CANNOT_ADD,
    }),
    invalid: refuseField('intentId', idMessage('an upload')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Uploaded.', documentId: expect.any(String) })
    const rows = await db
      .select({ title: documents.title })
      .from(documents)
      .where(eq(documents.recordId, (await forIntent()).caseId))
    expect(rows.map((r) => r.title)).toContain('Letter to finalize')
  },
})
