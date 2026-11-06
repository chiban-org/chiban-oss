import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { documents, uploadIntents } from '@/db/schema'
import { createUploadIntent } from '@/features/documents/uploads'
import { createProject } from '@/features/projects/projects'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { pdfBytes } from '@/test/documentFixtures'
import { makeParcel, staffActor } from '@/test/parcels'
import {
  actionHarness,
  choice,
  describeActionCases,
  int,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { describeForeignRecordCase } from '@/test/testHarness/actions/foreignRecord'
import { plainPortalRefusals } from '@/test/testHarness/actions/plainRefusals'
import type { FinalizeResponse, IntentResponse } from './uploadActions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const { createUploadIntentAction, finalizeUploadAction } = await import('./uploadActions')

const h = actionHarness()
h.useObjectStore()

const signal = new AbortController().signal
const CANNOT_ADD = { ok: false as const, error: 'You cannot add files here.' }
const BYTES = pdfBytes('portal upload')
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db, { starters: ['nh.starter.alarm_registration'] })
})

async function draft(): Promise<string> {
  return (await makeApplication(h.db, world, {}, undefined, 'AR')).applicationId
}

async function strangerOnOwnRecord() {
  const stranger = await staffActor(h.db, 'applicant')
  const parcelId = await makeParcel(h.db, [])
  const project = await createProject(h.db, stranger, { parcelId, title: 'Shed' }, signal)
  if (!project.ok) throw new Error('project failed')
  return stranger
}

const intentInput = async () => ({
  targetKind: 'application',
  targetId: await draft(),
  title: 'Site plan',
  filename: 'site.pdf',
  contentType: 'application/pdf',
  sizeBytes: String(BYTES.length),
})

const INTENT_COPY: Record<string, string> = {
  targetKind: 'Choose where to attach the file.',
  targetId: 'Choose a record.',
  title: 'Enter a document name.',
  filename: 'Enter a file name.',
  sizeBytes: 'Enter the file size as a whole number from 0 to 9007199254740991.',
}

const INTENT_TOO_LONG: Record<string, string> = {
  title: 'Enter a document name of 300 characters or fewer.',
  filename: 'Enter a file name of 500 characters or fewer.',
}

describeActionCases(h, 'createUploadIntentAction', {
  invoke: createUploadIntentAction,
  actor: () => world.applicant,
  input: intentInput,
  fields: {
    targetKind: choice({ required: true }),
    targetId: uuid({ required: true }),
    title: text({ required: true, max: 300 }),
    filename: text({ required: true, max: 500 }),
    sizeBytes: int({ required: true }),
  },
  capability: 'document.manage',
  refusals: {
    ...plainPortalRefusals<IntentResponse>(),
    forbidden: CANNOT_ADD,
    invalid: (v) => ({
      ok: false as const,
      error:
        (v.kind === 'missing' && v.field === 'sizeBytes' ? 'Enter the file size.' : undefined) ??
        (v.kind === 'too_long' ? INTENT_TOO_LONG[v.field] : undefined) ??
        INTENT_COPY[v.field] ??
        '',
    }),
  },
  accepted: async (result, { db, input }) => {
    expect(result).toMatchObject({ ok: true, intentId: expect.any(String) })
    const rows = await db
      .select({
        title: uploadIntents.title,
        filename: uploadIntents.filename,
        userId: uploadIntents.userId,
      })
      .from(uploadIntents)
      .where(eq(uploadIntents.targetId, input.targetId))
    expect(rows).toEqual([
      { title: 'Site plan', filename: 'site.pdf', userId: world.applicant.userId },
    ])
  },
})

describeForeignRecordCase(h, 'createUploadIntentAction on another applicant record', {
  invoke: createUploadIntentAction,
  actor: strangerOnOwnRecord,
  input: intentInput,
  refusal: CANNOT_ADD,
})

async function uploadedIntent(): Promise<string> {
  const made = await createUploadIntent(
    h.db,
    h.store,
    world.applicant,
    {
      target: { kind: 'application', id: await draft() },
      title: 'Site plan',
      filename: 'site.pdf',
      contentType: 'application/pdf',
      sizeBytes: BYTES.length,
    },
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  const put = await fetch(made.value.url, {
    method: 'PUT',
    headers: made.value.headers,
    body: new Blob([BYTES]),
  })
  if (!put.ok) throw new Error('put failed')
  return made.value.intentId
}

describeActionCases(h, 'finalizeUploadAction', {
  invoke: finalizeUploadAction,
  actor: () => world.applicant,
  input: async () => ({ intentId: await uploadedIntent() }),
  fields: { intentId: uuid({ required: true }) },
  refusedRoles: ROLES,
  refusals: {
    ...plainPortalRefusals<FinalizeResponse>(),
    forbidden: CANNOT_ADD,
    invalid: { ok: false, error: 'Choose an upload.' },
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true })
    const rows = await db.select({ title: documents.title }).from(documents)
    expect(rows.map((r) => r.title)).toContain('Site plan')
  },
})

describeForeignRecordCase(h, 'finalizeUploadAction on another applicant upload', {
  invoke: finalizeUploadAction,
  actor: strangerOnOwnRecord,
  input: async () => ({ intentId: await uploadedIntent() }),
  refusal: CANNOT_ADD,
})
