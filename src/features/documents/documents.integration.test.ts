import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { countApplicationsForViewer } from '@/features/access/queries'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import { downloadDocument } from '@/features/documents/download'
import { listDocuments } from '@/features/documents/listDocuments'
import { setAudiences, setPublic, uploadRedactedCopy } from '@/features/documents/publish'
import { createUploadIntent } from '@/features/documents/uploads'
import { resolveRendition } from '@/features/documents/visibility'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { assignReviewer } from '@/features/reviews/assignments'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeUser } from '@/test/factories'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let appId: string
let rival: Actor
let rivalApp: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  appId = (await makeApplication(handle.db, world)).applicationId
  rival = await staffActor(handle.db, 'applicant')
  const project = await createProject(
    handle.db,
    rival,
    { parcelId: world.parcelId, title: 'Rival' },
    signal,
  )
  if (!project.ok) throw new Error('project')
  rivalApp = (
    await makeApplication(handle.db, {
      ...world,
      projectId: project.value.projectId,
      applicant: rival,
    })
  ).applicationId
})
afterAll(async () => {
  await handle.drop()
})

const appRef = (id: string) => ({ kind: 'application' as const, id })
const idsFor = async (actor: Actor | null, id: string) =>
  (await listDocuments(handle.db, actor, { record: appRef(id), limit: 25 }, signal)).rows.map(
    (r) => r.documentId,
  )

describe('documents', () => {
  it("identical bytes from two applicants share one file and neither sees the other's document", async () => {
    const bytes = pdfBytes('identical')
    const mine = await uploadAs(handle.db, store, world.applicant, appRef(appId), bytes)
    const theirs = await uploadAs(handle.db, store, rival, appRef(rivalApp), bytes)
    expect(mine.documentId).not.toBe(theirs.documentId)
    expect(await idsFor(world.applicant, appId)).toContain(mine.documentId)
    expect(await idsFor(world.applicant, rivalApp)).toEqual([])
    expect(await idsFor(rival, appId)).toEqual([])
    expect(
      await downloadDocument(handle.db, store, rival, mine.documentId, 'default', signal),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(
      (
        await downloadDocument(
          handle.db,
          store,
          world.applicant,
          mine.documentId,
          'default',
          signal,
        )
      ).ok,
    ).toBe(true)
  })

  it('staff-only document is invisible to the applicant party in list and download', async () => {
    const created = await uploadAs(
      handle.db,
      store,
      world.staff,
      appRef(appId),
      pdfBytes('staff only'),
      { title: 'Internal memo' },
    )
    const set = await setAudiences(
      handle.db,
      world.staff,
      { documentId: created.documentId, audiences: [] },
      signal,
    )
    expect(set.ok).toBe(true)
    expect(await idsFor(world.applicant, appId)).not.toContain(created.documentId)
    expect(
      await downloadDocument(
        handle.db,
        store,
        world.applicant,
        created.documentId,
        'default',
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await idsFor(world.staff, appId)).toContain(created.documentId)
  })

  it('reviewer sees a reviewers-audience document on an assigned application only', async () => {
    const doc = await uploadAs(
      handle.db,
      store,
      world.staff,
      appRef(appId),
      pdfBytes('for reviewers'),
    )
    expect(await idsFor(world.reviewer, appId)).toEqual([])
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: appId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect(await idsFor(world.reviewer, appId)).toContain(doc.documentId)
    expect(await idsFor(world.reviewer, rivalApp)).toEqual([])
    await setAudiences(
      handle.db,
      world.staff,
      { documentId: doc.documentId, audiences: ['project_parties'] },
      signal,
    )
    expect(await idsFor(world.reviewer, appId)).not.toContain(doc.documentId)
  })

  it('contractor sees project_parties documents only after claim', async () => {
    const email = 'builder@alderpond.example'
    const added = await addParty(
      handle.db,
      world.staff,
      { projectId: world.projectId, role: 'contractor', name: 'Bo Builder', email },
      signal,
    )
    if (!added.ok) throw new Error('party')
    const userId = await makeUser(handle.db, { role: 'contractor', email })
    const contractor = (await loadActor(handle.db, userId, signal)) as Actor
    const doc = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(appId),
      pdfBytes('for contractor'),
    )
    expect(await idsFor(contractor, appId)).toEqual([])
    const { projectParties } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    await handle.db
      .update(projectParties)
      .set({ userId })
      .where(eq(projectParties.id, added.value.partyId))
    expect(await idsFor(contractor, appId)).toContain(doc.documentId)
  })

  it('applicant sees 3 of 40 documents with limit 25 and no next cursor', async () => {
    const crowded = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      crowded,
      { parcelId: world.parcelId, title: 'Crowded' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    const app = (
      await makeApplication(handle.db, {
        ...world,
        projectId: project.value.projectId,
        applicant: crowded,
      })
    ).applicationId
    const { sha256 } = await storeGeneratedBytes(
      handle.db,
      store,
      pdfBytes('crowd'),
      'application/pdf',
      signal,
    )
    for (let i = 0; i < 40; i += 1) {
      await handle.db.transaction((t) =>
        attachDocument(
          t,
          world.staff,
          {
            target: appRef(app),
            title: `Doc ${i}`,
            docKind: 'attachment',
            file: { sha256, filename: 'a.pdf', contentType: 'application/pdf' },
            audiences: i < 3 ? ['project_parties'] : [],
          },
          signal,
        ),
      )
    }
    const page = await listDocuments(handle.db, crowded, { record: appRef(app), limit: 25 }, signal)
    expect(page.rows).toHaveLength(3)
    expect(page.nextCursor).toBeNull()
    expect(await countApplicationsForViewer(handle.db, crowded, signal)).toBe(1)
  })

  it('public viewer gets the redacted rendition once one exists, and the original before', async () => {
    const doc = await uploadAs(
      handle.db,
      store,
      world.staff,
      appRef(appId),
      pdfBytes('original with phone'),
      { title: 'Application packet' },
    )
    await setPublic(handle.db, world.staff, { documentId: doc.documentId, isPublic: true }, signal)
    const before = await resolveRendition(handle.db, null, doc.documentId, signal)
    expect(before.ok && before.value.role).toBe('original')
    const intent = await createUploadIntent(
      handle.db,
      store,
      world.staff,
      {
        target: appRef(appId),
        title: 'Application packet',
        filename: 'redacted.pdf',
        contentType: 'application/pdf',
        sizeBytes: pdfBytes('redacted copy').length,
      },
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    await fetch(intent.value.url, {
      method: 'PUT',
      headers: intent.value.headers,
      body: new Blob([pdfBytes('redacted copy')]),
    })
    const redacted = await uploadRedactedCopy(
      handle.db,
      store,
      world.staff,
      { documentId: doc.documentId, intentId: intent.value.intentId },
      signal,
    )
    expect(redacted.ok).toBe(true)
    const publicView = await resolveRendition(handle.db, null, doc.documentId, signal)
    expect(publicView.ok && publicView.value.role).toBe('public_redacted')
  })

  it('party with the project_parties audience still gets the original of a redacted public document', async () => {
    const doc = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(appId),
      pdfBytes('party original'),
    )
    await setPublic(handle.db, world.staff, { documentId: doc.documentId, isPublic: true }, signal)
    const intent = await createUploadIntent(
      handle.db,
      store,
      world.staff,
      {
        target: appRef(appId),
        title: 'x',
        filename: 'r.pdf',
        contentType: 'application/pdf',
        sizeBytes: pdfBytes('party redacted').length,
      },
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    await fetch(intent.value.url, {
      method: 'PUT',
      headers: intent.value.headers,
      body: new Blob([pdfBytes('party redacted')]),
    })
    await uploadRedactedCopy(
      handle.db,
      store,
      world.staff,
      { documentId: doc.documentId, intentId: intent.value.intentId },
      signal,
    )
    const party = await resolveRendition(handle.db, world.applicant, doc.documentId, signal)
    expect(party.ok && party.value.role).toBe('original')
    const stranger = await resolveRendition(handle.db, rival, doc.documentId, signal)
    expect(stranger.ok && stranger.value.role).toBe('public_redacted')
  })

  it('setPublic without document.publish is forbidden', async () => {
    const doc = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(appId),
      pdfBytes('no publish'),
    )
    expect(
      await setPublic(
        handle.db,
        world.reviewer,
        { documentId: doc.documentId, isPublic: true },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await setPublic(
        handle.db,
        world.applicant,
        { documentId: doc.documentId, isPublic: true },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('download redirect points at the public endpoint and expires in 60 seconds', async () => {
    const doc = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(appId),
      pdfBytes('redirect'),
    )
    const result = await downloadDocument(
      handle.db,
      store,
      world.applicant,
      doc.documentId,
      'default',
      signal,
    )
    if (!result.ok) throw new Error('download')
    const url = new URL(result.value.url)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60')
    expect(url.searchParams.get('response-content-disposition')).toContain('inline')
  })
})
