import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  documentVersions,
  files,
  ledgerEntries,
  notificationOutbox,
  preservationRecords,
  projects,
  recordEvents,
  userRoles,
} from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { setAudiences } from '@/features/documents/publish'
import { blobKey, ingestTempObject, sha256Hex } from '@/features/files/ingest'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import type { MailTransport } from '@/features/mail/transport'
import { queueNotification } from '@/features/notifications/queue'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { saveDraftValues } from '@/features/portal/drafts'
import { getPortalApplicationView } from '@/features/portal/portalView'
import { portalReceiptPdfResponse } from '@/features/portal/receiptAccess'
import { createProject } from '@/features/projects/projects'
import { listWorkQueue } from '@/features/queue/workQueue'
import { setDocumentSeries } from '@/features/records/assignments'
import { checkDisposition } from '@/features/records/disposition'
import { addReviewComment, assignReviewer } from '@/features/reviews/assignments'
import { getAssignmentView, listMyAssignments } from '@/features/reviews/reviewerView'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { lineAllocation, setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import { pdfPages } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

describe('finding 1: a temp object replaced after hashing cannot overwrite a shared blob', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db)
  })

  it('an existing blob is never rewritten and a swapped new object is refused', async () => {
    const good = pdfBytes('shared bytes')
    const sha = sha256Hex(good)
    const stage = async (bytes: Uint8Array) => {
      const key = `uploads/tmp/${crypto.randomUUID()}`
      await store.putBytes(key, bytes, 'application/pdf', signal)
      return key
    }
    const first = await stage(good)
    const done = await ingestTempObject(
      handle.db,
      store,
      { tempKey: first, declaredType: 'application/pdf', declaredSize: good.length },
      signal,
    )
    expect(done.ok).toBe(true)
    const evil = pdfBytes('evil bytes!').slice(0, good.length)
    const second = await stage(good)
    const swapping: ObjectStore = {
      ...store,
      copy: async (from, to, s, opts) => {
        await store.putBytes(from, evil, 'application/pdf', s)
        await store.copy(from, to, s, opts)
      },
    }
    await ingestTempObject(
      handle.db,
      swapping,
      { tempKey: second, declaredType: 'application/pdf', declaredSize: good.length },
      signal,
    )
    const stream = await store.getStream(blobKey(sha), signal)
    if (!stream.ok) throw new Error('blob')
    const bytes = new Uint8Array(await new Response(stream.value).arrayBuffer())
    expect(sha256Hex(bytes)).toBe(sha)

    const fresh = pdfBytes('brand new bytes')
    const third = await stage(fresh)
    const swap2: ObjectStore = {
      ...store,
      copy: async (from, to, s, opts) => {
        await store.putBytes(from, pdfBytes('swapped!!!!!!!!'), 'application/pdf', s)
        await store.copy(from, to, s, opts)
      },
    }
    const result = await ingestTempObject(
      handle.db,
      swap2,
      { tempKey: third, declaredType: 'application/pdf', declaredSize: fresh.length },
      signal,
    )
    expect(result.ok).toBe(false)
    const rows = await handle.db
      .select()
      .from(files)
      .where(eq(files.sha256, sha256Hex(fresh)))
    expect(rows).toHaveLength(0)
  })
})

describe('finding 2: a receipt shows only lines for the application being viewed', () => {
  it('another application on the same payment is not disclosed', async () => {
    const { world: w } = await setupTradeWorld(handle.db)
    const a = await submittedTrade(handle.db, w)
    const other = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      other,
      { parcelId: w.parcelId, title: 'Other' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    const b = await submittedTrade(
      handle.db,
      w,
      new Date('2027-03-02T15:00:00Z'),
      project.value.projectId,
    )
    const paid = await recordCounterPayment(
      handle.db,
      w.staff,
      {
        method: 'cash',
        amountCents: 9000,
        payerName: 'Pat',
        allocations: [lineAllocation(a, 4500), lineAllocation(b, 4500)],
      },
      signal,
      new Date('2027-03-02T17:00:00Z'),
    )
    if (!paid.ok) throw new Error(paid.error)
    const [entry] = await handle.db
      .select({ receipt_id: ledgerEntries.receiptId })
      .from(ledgerEntries)
    const response = await portalReceiptPdfResponse(
      handle.db,
      w.applicant,
      { applicationId: a.applicationId, receiptId: entry?.receipt_id ?? '' },
      signal,
    )
    const bytes = await buildReceiptPdf(handle.db, entry?.receipt_id ?? '', signal, {
      applicationId: a.applicationId,
    })
    if (!bytes.ok) throw new Error('pdf')
    const text = (await pdfPages(bytes.value)).join('\n')
    expect(text).toContain(a.number)
    expect(text).not.toContain(b.number)
    expect(response.status).toBe(200)
    const body = response.body
    if (typeof body === 'string') throw new Error('expected bytes')
    const portalText = (await pdfPages(body)).join('\n')
    expect(portalText).not.toContain(b.number)
    const view = await getPortalApplicationView(handle.db, w.applicant, a.applicationId, signal)
    expect(view.ok && view.value.history.map((h) => h.amountCents)).toEqual([4500])
  })
})

describe('findings 3 to 8', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db)
  })

  it('3: saving a draft keeps staff-only values', async () => {
    await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', {
      ...FORM_BODY,
      fields: [
        ...FORM_BODY.fields,
        { key: 'staff_note', label: 'Staff note', type: 'text', required: false, staffOnly: true },
      ],
    })
    const app = await makeApplication(handle.db, world, {
      values: { staff_note: 'after the fact' },
    })
    const saved = await saveDraftValues(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { finished_sq_ft: '900' } },
      signal,
    )
    expect(saved.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.values).toEqual({ finished_sq_ft: '900', staff_note: 'after the fact' })
  })

  it("4: another application's withdrawal does not start this application's retention", async () => {
    const withdrawn = await makeApplication(handle.db, world, { state: 'submitted' })
    const second = await makeApplication(handle.db, world, { state: 'submitted' })
    const { store: s } = await makeTestStore()
    const up = await uploadAs(
      handle.db,
      s,
      world.applicant,
      { kind: 'application', id: second.applicationId },
      pdfBytes('second app'),
    )
    await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.applicant,
        {
          applicationId: withdrawn.applicationId,
          to: 'withdrawn',
          expectedRowVersion: 1,
          onDate: '2020-01-01' as CivilDate,
        },
        signal,
      ),
    )
    const [event] = await handle.db.select().from(recordEvents)
    expect(event?.applicationId).toBe(withdrawn.applicationId)
    await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.applicant,
        {
          applicationId: second.applicationId,
          to: 'withdrawn',
          expectedRowVersion: 1,
          onDate: '2029-01-01' as CivilDate,
        },
        signal,
      ),
    )
    const result = await checkDisposition(
      handle.db,
      { kind: 'document', id: up.documentId },
      '2029-06-01' as CivilDate,
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_yet_eligible' })
  })

  it('5: a snapshot does not list attachments the submitter cannot see', async () => {
    const app = await makeApplication(handle.db, world)
    const hidden = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: app.applicationId },
      pdfBytes('staff only memo'),
      { title: 'Internal memo', filename: 'internal-memo.pdf' },
    )
    await setAudiences(
      handle.db,
      world.staff,
      { documentId: hidden.documentId, audiences: [] },
      signal,
    )
    const done = await submitApplication(
      handle.db,
      world.applicant,
      {
        applicationId: app.applicationId,
        values: { classification: 'residential' },
        attestation: { statementSha256: attestationHash(appTypeBody().attestationText) },
      },
      signal,
      new Date(),
      store,
    )
    expect(done.ok).toBe(true)
    const { applicationSnapshots } = await import('@/db/schema')
    const [snap] = await handle.db.select().from(applicationSnapshots)
    expect(JSON.stringify(snap?.body)).not.toContain('internal-memo.pdf')
  })

  it('6: a user who lost the reviewer role cannot use an old assignment', async () => {
    const app = await makeApplication(handle.db, world)
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    if (!assigned.ok) throw new Error('assign')
    await handle.db.delete(userRoles).where(eq(userRoles.userId, world.reviewer.userId))
    const { loadActor } = await import('@/features/auth/actor')
    const demoted = await loadActor(handle.db, world.reviewer.userId, signal)
    if (demoted === null) throw new Error('actor')
    expect(await listMyAssignments(handle.db, demoted, signal)).toEqual([])
    expect(
      await getAssignmentView(handle.db, demoted, assigned.value.assignmentId, signal),
    ).toBeNull()
    expect(
      await addReviewComment(
        handle.db,
        demoted,
        { assignmentId: assigned.value.assignmentId, body: 'still here' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('7: moving a document to a pdfa series makes preservation required', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'parcel', id: world.parcelId },
      pdfBytes('letter'),
      { seriesKey: 'nh.rs.correspondence_administrative' },
    )
    const [before] = await handle.db.select().from(preservationRecords)
    expect(before?.status).toBe('not_required')
    const changed = await setDocumentSeries(
      handle.db,
      world.staff,
      { documentId: up.documentId, seriesKey: 'nh.rs.blueprints_architectural' },
      signal,
    )
    expect(changed.ok).toBe(true)
    const [after] = await handle.db.select().from(preservationRecords)
    expect(after).toMatchObject({ required: true, status: 'pending' })
    expect(documentVersions).toBeDefined()
  })

  it('8: the queue flags hidden preservation problems only for staff who can see the document', async () => {
    const app = await makeApplication(handle.db, world, { state: 'submitted' })
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: app.applicationId },
      pdfBytes('hidden'),
    )
    await setAudiences(handle.db, world.staff, { documentId: up.documentId, audiences: [] }, signal)
    await handle.db.update(preservationRecords).set({ status: 'incomplete' })
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    const asStaff = await listWorkQueue(handle.db, world.staff, { filters: {}, limit: 25 }, signal)
    expect(
      asStaff.rows.find((r) => r.applicationId === app.applicationId)?.preservationIncomplete,
    ).toBe(true)
    const asReviewer = await listWorkQueue(
      handle.db,
      world.reviewer,
      { filters: {}, limit: 25 },
      signal,
    )
    expect(
      asReviewer.rows.find((r) => r.applicationId === app.applicationId)?.preservationIncomplete,
    ).toBe(false)
    expect(projects).toBeDefined()
  })

  it('9: one failed send does not roll back the messages already delivered', async () => {
    const app = await makeApplication(handle.db, world)
    const other = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      other,
      { parcelId: world.parcelId, title: 'Second' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    const second = await makeApplication(handle.db, {
      ...world,
      projectId: project.value.projectId,
      applicant: other,
    })
    await handle.db.transaction(async (tx) => {
      await queueNotification(
        tx,
        {
          event: 'application_issued',
          applicationId: app.applicationId,
          recipientUserIds: [world.applicant.userId],
        },
        signal,
      )
      await queueNotification(
        tx,
        {
          event: 'application_issued',
          applicationId: second.applicationId,
          recipientUserIds: [other.userId],
        },
        signal,
      )
    })
    let calls = 0
    const flaky: MailTransport = {
      send: () => {
        calls += 1
        if (calls === 2) throw new Error('smtp exploded')
        return Promise.resolve({ ok: true as const, value: undefined })
      },
    }
    await handle.db.transaction(async (tx) => {
      await sendQueuedNotifications(tx, flaky, signal)
    })
    const rows = await handle.db.select().from(notificationOutbox)
    expect(rows.map((r) => r.status).sort()).toEqual(['queued', 'sent'])
    expect(rows.find((r) => r.status === 'queued')?.attempts).toBe(1)
  })
})
