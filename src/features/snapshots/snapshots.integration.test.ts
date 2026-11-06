import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationSnapshots, applications, documentVersions } from '@/db/schema'
import {
  amendApplication,
  attestationHash,
  submitApplication,
} from '@/features/applications/submitApplication'
import { setPublic } from '@/features/documents/publish'
import { resolveRendition } from '@/features/documents/visibility'
import { sha256Hex } from '@/features/files/ingest'
import { canonicalJson } from '@/features/snapshots/canonicalJson'
import type { ApplicationSnapshotBody } from '@/features/snapshots/publicView'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { pdfPages } from '@/test/pdfText'
import { approvePublic } from '@/test/renditionFixtures'

const signal = new AbortController().signal
const ATTESTATION = attestationHash(appTypeBody().attestationText)
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

const FORM_WITH_CONTACT = {
  ...FORM_BODY,
  fields: [
    ...FORM_BODY.fields,
    { key: 'contact_email', label: 'Contact email', type: 'email', required: false },
    { key: 'contact_phone', label: 'Contact phone', type: 'phone', required: false },
  ],
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', FORM_WITH_CONTACT)
})
afterEach(async () => {
  await handle.drop()
})

const VALUES = {
  classification: 'residential',
  contact_email: 'alex@alderpond.example',
  contact_phone: '603-555-0142',
}

async function submit(applicationId: string, values: Record<string, unknown> = VALUES) {
  return await submitApplication(
    handle.db,
    world.applicant,
    { applicationId, values, attestation: { statementSha256: ATTESTATION } },
    signal,
    new Date('2027-03-02T15:00:00Z'),
    store,
  )
}

async function snapshots(applicationId: string) {
  return await handle.db
    .select()
    .from(applicationSnapshots)
    .where(eq(applicationSnapshots.applicationId, applicationId))
    .orderBy(applicationSnapshots.sequence)
}

describe('application snapshots', () => {
  it('submit creates snapshot 1 with the pinned form version body', async () => {
    const app = await makeApplication(handle.db, world)
    expect((await submit(app.applicationId)).ok).toBe(true)
    const [snap] = await snapshots(app.applicationId)
    const body = snap?.body as ApplicationSnapshotBody
    expect(snap?.sequence).toBe(1)
    expect(snap?.reason).toBe('submission')
    expect(body.form.key).toBe('bp-form')
    expect(body.form.fields.map((f) => f.key)).toContain('contact_email')
    expect(body.values.classification).toBe('residential')
    expect(body.attestation?.statementSha256).toBe(ATTESTATION)
    expect(snap?.bodySha256).toBe(createHash('sha256').update(canonicalJson(body)).digest('hex'))
  })

  it('amend after submit creates snapshot 2 and leaves snapshot 1 byte-identical', async () => {
    const app = await makeApplication(handle.db, world)
    await submit(app.applicationId)
    const [first] = await snapshots(app.applicationId)
    const amended = await amendApplication(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { ...VALUES, classification: 'nonresidential' } },
      signal,
      store,
    )
    expect(amended.ok).toBe(true)
    const all = await snapshots(app.applicationId)
    expect(all.map((s) => s.sequence)).toEqual([1, 2])
    expect(all[0]?.bodySha256).toBe(first?.bodySha256)
    expect(JSON.stringify(all[0]?.body)).toBe(JSON.stringify(first?.body))
    expect((all[1]?.body as ApplicationSnapshotBody).values.classification).toBe('nonresidential')
    expect(all[1]?.reason).toBe('amendment')
  })

  it('amending a draft does not create a snapshot', async () => {
    const app = await makeApplication(handle.db, world)
    await amendApplication(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: VALUES },
      signal,
      store,
    )
    expect(await snapshots(app.applicationId)).toHaveLength(0)
  })

  it('update of a snapshot raises', async () => {
    const app = await makeApplication(handle.db, world)
    await submit(app.applicationId)
    await expectDbError(
      handle.db.update(applicationSnapshots).set({ reason: 'amendment' }),
      /insert-only/,
    )
    await expectDbError(handle.db.delete(applicationSnapshots), /insert-only/)
  })

  it('snapshot lists attachment hashes', async () => {
    const app = await makeApplication(handle.db, world)
    const bytes = pdfBytes('attached plan')
    await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: app.applicationId },
      bytes,
    )
    await submit(app.applicationId)
    const [snap] = await snapshots(app.applicationId)
    const body = snap?.body as ApplicationSnapshotBody
    expect(body.attachments.map((a) => a.sha256)).toEqual([sha256Hex(bytes)])
  })

  it("published snapshot serves a public rendition without the applicant's email and phone", async () => {
    const app = await makeApplication(handle.db, world)
    await submit(app.applicationId)
    const [snap] = await snapshots(app.applicationId)
    const versions = await handle.db.select().from(documentVersions)
    const documentId = versions.find((v) => v.role === 'public_redacted')?.documentId
    expect(documentId).toBeDefined()
    expect(snap).toBeDefined()
    await approvePublic(
      handle.db,
      world.staff,
      versions.find((v) => v.role === 'public_redacted')?.id ?? '',
      store,
    )
    await setPublic(
      handle.db,
      world.staff,
      { documentId: documentId ?? '', isPublic: true },
      signal,
    )
    const resolved = await resolveRendition(handle.db, null, documentId ?? '', signal)
    if (!resolved.ok) throw new Error('rendition')
    expect(resolved.value.role).toBe('public_redacted')
    const stream = await store.getStream(resolved.value.file.storageKey, signal)
    if (!stream.ok) throw new Error('bytes')
    const text = (
      await pdfPages(new Uint8Array(await new Response(stream.value).arrayBuffer()))
    ).join('\n')
    expect(text).toContain('Residential')
    expect(text).not.toContain('555-0142')
    expect(text).not.toContain('alex@alderpond.example')
    const priv = await resolveRendition(handle.db, world.staff, documentId ?? '', signal)
    if (!priv.ok) throw new Error('private')
    const privStream = await store.getStream(priv.value.file.storageKey, signal)
    if (!privStream.ok) throw new Error('bytes')
    const privText = (
      await pdfPages(new Uint8Array(await new Response(privStream.value).arrayBuffer()))
    ).join('\n')
    expect(privText).toContain('555-0142')
  })

  it('a failed snapshot rolls back the submission', async () => {
    const app = await makeApplication(handle.db, world)
    const broken = {
      ...store,
      putBytes: () => Promise.reject(new Error('storage down')),
    } as ObjectStore
    await expect(
      submitApplication(
        handle.db,
        world.applicant,
        {
          applicationId: app.applicationId,
          values: VALUES,
          attestation: { statementSha256: ATTESTATION },
        },
        signal,
        new Date('2027-03-02T15:00:00Z'),
        broken,
      ),
    ).rejects.toThrow('storage down')
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.state).toBe('draft')
    expect(await snapshots(app.applicationId)).toHaveLength(0)
  })
})
