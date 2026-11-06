import { beforeAll, describe, expect, it, vi } from 'vitest'
import { documents } from '@/db/schema'
import { createUploadIntent } from '@/features/documents/uploads'
import { CHECK_PASSED } from '@/server/formInput'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeParcel, seedParcelWorld } from '@/test/parcels'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  int,
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
const SERIES = 'nh.rs.blueprints_architectural'
const SIZE_RANGE = 'as a whole number from 0 to 9007199254740991.'
let parcelId = ''
let documentId = ''
let counter = 0

type Plain = { ok: true } | { ok: false; error: string }
const plain = STAFF_REFUSALS as unknown as Refusals<Plain>

beforeAll(async () => {
  await seedParcelWorld(h.db)
  parcelId = await makeParcel(h.db, [])
  const staff = await h.actorFor('staff')
  const uploaded = await uploadAs(
    h.db,
    h.store,
    staff,
    { kind: 'parcel', id: parcelId },
    pdfBytes('existing'),
    { seriesKey: SERIES },
  )
  documentId = uploaded.documentId
})

async function stagedIntent(): Promise<string> {
  counter += 1
  const bytes = pdfBytes(`staged ${counter}`)
  const made = await createUploadIntent(
    h.db,
    h.store,
    await h.actorFor('staff'),
    {
      target: { kind: 'parcel', id: parcelId },
      title: 'Plat',
      filename: 'plat.pdf',
      contentType: 'application/pdf',
      sizeBytes: bytes.length,
      seriesKey: SERIES,
    },
    signal,
  )
  if (!made.ok) throw new Error(`intent ${made.error}`)
  const put = await fetch(made.value.url, {
    method: 'PUT',
    headers: made.value.headers,
    body: new Blob([bytes]),
  })
  if (!put.ok) throw new Error(`put ${put.status}`)
  return made.value.intentId
}

function intentRefusal(variant: { field: string; kind: string }): Plain {
  const copy: Record<string, string> = {
    targetKind: 'Choose where to attach the file.',
    targetId: 'Choose a record.',
    title: 'Enter a title of 300 characters or fewer.',
    filename:
      variant.kind === 'too_long'
        ? 'Enter a file name of 500 characters or fewer.'
        : 'Enter a file name.',
    contentType:
      variant.kind === 'too_long'
        ? 'Enter a file type of 200 characters or fewer.'
        : 'Enter a file type.',
    sizeBytes:
      variant.kind === 'missing' ? 'Enter the file size.' : `Enter the file size ${SIZE_RANGE}`,
    seriesKey: 'Enter a record series of 100 characters or fewer.',
  }
  return { ok: false, error: copy[variant.field] ?? '' }
}

describeActionCases(h, 'createStaffUploadIntentAction', {
  invoke: actions.createStaffUploadIntentAction,
  actor: () => h.actorFor('staff'),
  input: () => ({
    targetKind: 'parcel',
    targetId: parcelId,
    title: 'Plat',
    filename: 'plat.pdf',
    contentType: 'application/pdf',
    sizeBytes: String(pdfBytes('x').length),
    seriesKey: SERIES,
  }),
  fields: {
    targetKind: choice({ required: true }),
    targetId: uuid({ required: true }),
    title: text({ max: 300 }),
    filename: text({ required: true, max: 500 }),
    contentType: text({ required: true, max: 200 }),
    sizeBytes: int({ required: true, min: 0 }),
    seriesKey: text({ max: 100 }),
  },
  capability: 'document.manage',
  refusals: { ...plain, invalid: intentRefusal },
  accepted: (result, { written }) => {
    expect(result).toMatchObject({ ok: true, intentId: expect.any(String) })
    expect(written).toEqual(['upload_intents'])
  },
})

describe('createStaffUploadIntentAction feature refusals', () => {
  const attempt = async (patch: Record<string, string>) => {
    h.signIn(await h.actorFor('staff'))
    return await actions.createStaffUploadIntentAction(
      h.form({
        targetKind: 'parcel',
        targetId: parcelId,
        filename: 'plat.pdf',
        contentType: 'application/pdf',
        sizeBytes: '20',
        seriesKey: SERIES,
        ...patch,
      }),
    )
  }

  it('says an empty file is empty', async () => {
    expect(await attempt({ sizeBytes: '0' })).toEqual({
      ok: false,
      error: 'That file is empty. Choose a file with content.',
    })
  })

  it('says a parcel file needs a record series', async () => {
    expect(await attempt({ seriesKey: '' })).toEqual({
      ok: false,
      error: 'Choose a record series for a parcel file.',
    })
  })
})

describeActionCases(h, 'finalizeStaffUploadAction', {
  invoke: actions.finalizeStaffUploadAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ intentId: await stagedIntent(), visibility: 'private' }),
  fields: { intentId: uuid({ required: true }), visibility: choice() },
  capability: 'document.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      intentId: 'Choose an upload.',
      visibility: 'Choose who can see the file.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Uploaded.' })
    expect(written).toContain('documents')
    expect((await db.select().from(documents)).length).toBeGreaterThan(1)
  },
})

describe('finalizeStaffUploadAction repeat', () => {
  it('says an upload that was already completed was completed', async () => {
    h.signIn(await h.actorFor('staff'))
    const intentId = await stagedIntent()
    expect(await actions.finalizeStaffUploadAction(h.form({ intentId }))).toMatchObject({
      ok: true,
    })
    expect(await actions.finalizeStaffUploadAction(h.form({ intentId }))).toEqual({
      ok: false,
      error: 'That upload was already completed.',
    })
  })
})

describeActionCases(h, 'uploadRedactedAction', {
  invoke: actions.uploadRedactedAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ documentId, intentId: await stagedIntent() }),
  fields: { documentId: uuid({ required: true }), intentId: uuid({ required: true }) },
  capability: 'document.publish',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ documentId: 'Choose a document.', intentId: 'Choose an upload.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Redacted copy uploaded.' })
    expect(written).toContain('document_versions')
  },
})
