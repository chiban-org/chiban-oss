import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  documentVersions,
  files,
  rtkReleaseItems,
  rtkReleases,
  rtkRequests,
  rtkWithholdings,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import { openRelease, openReleaseVersion } from '@/features/rtk/releaseLinks'
import { createRelease, type ReleaseInput } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let reviewer: Actor
let requestId: string
let mail: ReturnType<typeof createMemoryTransport>

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  reviewer = await staffActor(handle.db, 'reviewer')
  mail = createMemoryTransport()
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'email',
      requesterName: 'Jordan Reyes',
      requesterContact: 'jordan@example.test',
      description: 'The Birch Lane owner letters',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error('log')
  requestId = logged.value.requestId
})
afterEach(async () => {
  await handle.drop()
})

interface ReleasableDoc {
  documentId: string
  originalId: string
  redactedId: string
  approvalId: string
}

async function releasable(): Promise<ReleasableDoc> {
  const doc = await uploadRedactionFixture(handle.db, store, custodian, 'letter.pdf')
  const redactedId = await redactedVersionOf(
    handle.db,
    store,
    custodian,
    doc,
    'rtk_release',
    requestId,
  )
  const approved = await approveRendition(
    handle.db,
    custodian,
    {
      versionId: redactedId,
      purpose: 'rtk_release',
      rtkRequestId: requestId,
      reviewStatement: STATEMENT,
    },
    signal,
    store,
  )
  if (!approved.ok) throw new Error(`approve ${approved.error}`)
  return {
    documentId: doc.documentId,
    originalId: doc.versionId,
    redactedId,
    approvalId: approved.value.approvalId,
  }
}

const release = (
  items: { documentId: string; approvalId: string }[],
  extra: Partial<ReleaseInput> = {},
  actor: Actor = custodian,
) =>
  createRelease(
    handle.db,
    store,
    mail,
    actor,
    { requestId, releasedOn: d('2027-07-09'), method: 'paper', items, ...extra },
    signal,
    NOW,
  )

function tokenFromMail(): string {
  return /\/records\/releases\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
}

async function letterText(documentId: string): Promise<string> {
  const [version] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [file] = await handle.db
    .select()
    .from(files)
    .where(eq(files.sha256, version?.fileSha256 ?? ''))
  const stream = await store.getStream(file?.storageKey ?? '', signal)
  if (!stream.ok) throw new Error('bytes')
  return (await pdfText(new Uint8Array(await new Response(stream.value).arrayBuffer()))).replace(
    /\n/g,
    ' ',
  )
}

describe('creating a release', () => {
  it('release with an unapproved redacted version is approval_missing', async () => {
    const doc = await releasable()
    const other = await uploadRedactionFixture(handle.db, store, custodian, 'letter.pdf')
    const loose = await redactedVersionOf(
      handle.db,
      store,
      custodian,
      other,
      'rtk_release',
      requestId,
    )
    expect(loose).not.toBe('')
    expect(await release([{ documentId: other.documentId, approvalId: doc.approvalId }])).toEqual({
      ok: false,
      error: 'approval_missing',
    })
    expect(
      await release([
        { documentId: other.documentId, approvalId: '00000000-0000-4000-8000-000000000000' },
      ]),
    ).toEqual({ ok: false, error: 'approval_missing' })
    expect(await handle.db.select().from(rtkReleases)).toHaveLength(0)
  })

  it('an approval that was revoked is approval_revoked', async () => {
    const doc = await releasable()
    await revokeApproval(
      handle.db,
      custodian,
      { approvalId: doc.approvalId, reason: 'The redaction missed a name' },
      signal,
      store,
    )
    expect(await release([{ documentId: doc.documentId, approvalId: doc.approvalId }])).toEqual({
      ok: false,
      error: 'approval_revoked',
    })
  })

  it('an rtk_release approval made for another request is approval_missing', async () => {
    const doc = await releasable()
    const second = await logRequest(
      handle.db,
      custodian,
      { receivedOn: d('2027-07-05'), receivedVia: 'mail', description: 'Another request' },
      signal,
      NOW,
    )
    if (!second.ok) throw new Error('log')
    const r = await createRelease(
      handle.db,
      store,
      mail,
      custodian,
      {
        requestId: second.value.requestId,
        releasedOn: d('2027-07-09'),
        method: 'paper',
        items: [{ documentId: doc.documentId, approvalId: doc.approvalId }],
      },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'approval_missing' })
  })

  it('releasing a redacted version records its exemptions as withholdings', async () => {
    const doc = await releasable()
    const r = await release([{ documentId: doc.documentId, approvalId: doc.approvalId }])
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ sequence: 1 }) })
    const rows = await handle.db.select().from(rtkWithholdings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      requestId,
      scope: 'redacted',
      exemptionKey: 'nh.rtk.91a5.iv',
      documentId: doc.documentId,
    })
    expect(rows[0]?.releaseId).toBe(r.ok ? r.value.releaseId : '')
    expect(rows[0]?.explanation).toContain('private phone number')
  })

  it('releasing the original adds no withholding', async () => {
    const doc = await uploadRedactionFixture(handle.db, store, custodian, 'letter.pdf')
    const approved = await approveRendition(
      handle.db,
      custodian,
      {
        versionId: doc.versionId,
        purpose: 'rtk_release',
        rtkRequestId: requestId,
        reviewStatement: STATEMENT,
      },
      signal,
      store,
    )
    if (!approved.ok) throw new Error('approve')
    expect(
      (await release([{ documentId: doc.documentId, approvalId: approved.value.approvalId }])).ok,
    ).toBe(true)
    expect(await handle.db.select().from(rtkWithholdings)).toHaveLength(0)
  })

  it('the first release closes the response clock and a request that is closed refuses', async () => {
    const doc = await releasable()
    await release([{ documentId: doc.documentId, approvalId: doc.approvalId }])
    const [row] = await handle.db.select().from(rtkRequests)
    expect(row?.status).toBe('responded')
    expect(row?.firstResponseKind).toBe('made_available')
    expect(row?.firstResponseOn).toBe('2027-07-09')
    expect(row?.openDueOn).toBeNull()
    await handle.db.update(rtkRequests).set({ status: 'closed' })
    expect(await release([{ documentId: doc.documentId, approvalId: doc.approvalId }])).toEqual({
      ok: false,
      error: 'not_open',
    })
  })

  it('second release is sequence 2 and leaves sequence 1 items unchanged', async () => {
    const first = await releasable()
    const second = await releasable()
    const r1 = await release([{ documentId: first.documentId, approvalId: first.approvalId }])
    const before = await handle.db.select().from(rtkReleaseItems)
    const r2 = await release([{ documentId: second.documentId, approvalId: second.approvalId }], {
      releasedOn: d('2027-07-12'),
    })
    expect(r1.ok && r1.value.sequence).toBe(1)
    expect(r2.ok && r2.value.sequence).toBe(2)
    const after = await handle.db.select().from(rtkReleaseItems)
    expect(after.filter((i) => i.releaseId === (r1.ok ? r1.value.releaseId : ''))).toEqual(before)
    expect(after).toHaveLength(2)
    const [request] = await handle.db.select().from(rtkRequests)
    expect(request?.firstResponseOn).toBe('2027-07-09')
  })

  it('letter lists every withholding from both releases', async () => {
    const first = await releasable()
    const second = await releasable()
    await recordWithholding(
      handle.db,
      custodian,
      {
        requestId,
        scope: 'withheld_in_full',
        recordDescription: 'Email from the town attorney',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: 'The email is a confidential communication seeking legal advice.',
      },
      signal,
    )
    await release([{ documentId: first.documentId, approvalId: first.approvalId }])
    const r2 = await release([{ documentId: second.documentId, approvalId: second.approvalId }], {
      releasedOn: d('2027-07-12'),
    })
    if (!r2.ok) throw new Error('release 2')
    const [row] = await handle.db
      .select()
      .from(rtkReleases)
      .where(eq(rtkReleases.id, r2.value.releaseId))
    const text = await letterText(row?.letterDocumentId ?? '')
    expect(text).toContain('Email from the town attorney')
    expect(text).toContain('Attorney-client privileged communications and attorney work product')
    expect(text.split('RSA 91-A:5 IV').length - 1).toBeGreaterThanOrEqual(2)
    expect(text).toContain('Records released')
  })

  it('a reviewer cannot release', async () => {
    const doc = await releasable()
    expect(
      await release([{ documentId: doc.documentId, approvalId: doc.approvalId }], {}, reviewer),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('release row update raises', async () => {
    const doc = await releasable()
    await release([{ documentId: doc.documentId, approvalId: doc.approvalId }])
    await expectDbError(
      handle.db.update(rtkReleases).set({ releasedOn: '2027-01-01' }),
      /insert-only/,
    )
    await expectDbError(handle.db.delete(rtkReleases), /insert-only/)
  })
})

describe('release links', () => {
  async function linked(): Promise<{ doc: ReleasableDoc; token: string; releaseId: string }> {
    const doc = await releasable()
    const r = await release([{ documentId: doc.documentId, approvalId: doc.approvalId }], {
      method: 'electronic_link',
      recipientEmail: 'jordan@example.test',
    })
    if (!r.ok) throw new Error(`release ${r.error}`)
    return { doc, token: tokenFromMail(), releaseId: r.value.releaseId }
  }

  it('an electronic link needs a recipient and emails the token with the request subject', async () => {
    const doc = await releasable()
    expect(
      await release([{ documentId: doc.documentId, approvalId: doc.approvalId }], {
        method: 'electronic_link',
      }),
    ).toEqual({ ok: false, error: 'recipient_required' })
    await release([{ documentId: doc.documentId, approvalId: doc.approvalId }], {
      method: 'electronic_link',
      recipientEmail: 'jordan@example.test',
    })
    expect(mail.sent.at(-1)?.subject).toBe('Records for request RK-2027-0001')
    expect(mail.sent.at(-1)?.to).toBe('jordan@example.test')
    expect(tokenFromMail().length).toBeGreaterThan(30)
    const [row] = await handle.db.select().from(rtkReleases)
    expect(row?.linkTokenHash).not.toContain(tokenFromMail())
    expect(row?.linkExpiresAt?.toISOString()).toBe('2027-08-13T15:00:00.000Z')
  })

  it('release link serves only its own versions', async () => {
    const { doc, token } = await linked()
    const opened = await openRelease(handle.db, token, NOW, signal)
    expect(opened.ok && opened.value.items.map((i) => i.versionId)).toEqual([doc.redactedId])
    const own = await openReleaseVersion(handle.db, store, token, doc.redactedId, NOW, signal)
    expect(own.ok && own.value.url).toContain('X-Amz-Signature')
    const original = await openReleaseVersion(handle.db, store, token, doc.originalId, NOW, signal)
    expect(original).toEqual({ ok: false, error: 'not_found' })
    const other = await releasable()
    expect(
      await openReleaseVersion(handle.db, store, token, other.redactedId, NOW, signal),
    ).toEqual({ ok: false, error: 'not_found' })
  })

  it('a link of one release does not open the versions of the next release', async () => {
    const first = await linked()
    const second = await releasable()
    await release([{ documentId: second.documentId, approvalId: second.approvalId }], {
      method: 'electronic_link',
      recipientEmail: 'jordan@example.test',
      releasedOn: d('2027-07-12'),
    })
    const secondToken = tokenFromMail()
    expect(
      await openReleaseVersion(handle.db, store, first.token, second.redactedId, NOW, signal),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(
      (await openReleaseVersion(handle.db, store, secondToken, second.redactedId, NOW, signal)).ok,
    ).toBe(true)
  })

  it('revoked version answers 410 on a release link', async () => {
    const { doc, token } = await linked()
    await revokeApproval(
      handle.db,
      custodian,
      { approvalId: doc.approvalId, reason: 'The redaction missed a name' },
      signal,
      store,
    )
    const res = await openReleaseVersion(handle.db, store, token, doc.redactedId, NOW, signal)
    expect(res).toEqual({
      ok: false,
      error: { withdrawnOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
    const [item] = await handle.db.select().from(rtkReleaseItems)
    expect(item?.withdrawnReason).toBe('revoked')
    const opened = await openRelease(handle.db, token, NOW, signal)
    expect(opened.ok && opened.value.items[0]?.withdrawnOn).not.toBeNull()
  })

  it('revoking any approval of a version withdraws it from release links made under another approval', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    const redacted = await redactedVersionOf(handle.db, store, staff, doc, 'public', requestId)
    const forRelease = await approveRendition(
      handle.db,
      staff,
      {
        versionId: redacted,
        purpose: 'rtk_release',
        rtkRequestId: requestId,
        reviewStatement: STATEMENT,
      },
      signal,
      store,
    )
    const forPublic = await approveRendition(
      handle.db,
      staff,
      { versionId: redacted, purpose: 'public', reviewStatement: STATEMENT },
      signal,
      store,
    )
    if (!forRelease.ok || !forPublic.ok) throw new Error('approve')
    const r = await release(
      [{ documentId: doc.documentId, approvalId: forRelease.value.approvalId }],
      {
        method: 'electronic_link',
        recipientEmail: 'jordan@example.test',
      },
    )
    if (!r.ok) throw new Error(`release ${r.error}`)
    const token = tokenFromMail()
    expect((await openReleaseVersion(handle.db, store, token, redacted, NOW, signal)).ok).toBe(true)
    await revokeApproval(
      handle.db,
      staff,
      { approvalId: forPublic.value.approvalId, reason: 'The public copy leaked a name' },
      signal,
      store,
    )
    const res = await openReleaseVersion(handle.db, store, token, redacted, NOW, signal)
    expect(res.ok).toBe(false)
    expect(!res.ok && typeof res.error === 'object').toBe(true)
  })

  it('superseding a public approval leaves earlier release links working', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    const redacted = await redactedVersionOf(handle.db, store, staff, doc, 'public', requestId)
    const first = await approveRendition(
      handle.db,
      staff,
      { versionId: redacted, purpose: 'public', reviewStatement: STATEMENT },
      signal,
      store,
    )
    if (!first.ok) throw new Error('approve')
    const r = await release([{ documentId: doc.documentId, approvalId: first.value.approvalId }], {
      method: 'electronic_link',
      recipientEmail: 'jordan@example.test',
    })
    if (!r.ok) throw new Error(`release ${r.error}`)
    const token = tokenFromMail()
    const next = await redactedVersionOf(handle.db, store, staff, doc)
    await approveRendition(
      handle.db,
      staff,
      { versionId: next, purpose: 'public', reviewStatement: STATEMENT },
      signal,
      store,
    )
    expect((await openReleaseVersion(handle.db, store, token, redacted, NOW, signal)).ok).toBe(true)
  })

  it('expired link answers expired and an unknown token is invalid', async () => {
    const { token } = await linked()
    const later = new Date('2027-08-14T15:00:00Z')
    expect(await openRelease(handle.db, token, later, signal)).toEqual({
      ok: false,
      error: 'expired',
    })
    expect(await openRelease(handle.db, 'not-a-token', NOW, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(
      await openReleaseVersion(
        handle.db,
        store,
        token,
        '00000000-0000-4000-8000-000000000000',
        later,
        signal,
      ),
    ).toEqual({ ok: false, error: 'expired' })
  })

  it('a release made on paper has no link', async () => {
    const doc = await releasable()
    await release([{ documentId: doc.documentId, approvalId: doc.approvalId }])
    const [row] = await handle.db.select().from(rtkReleases)
    expect(row?.linkTokenHash).toBeNull()
    expect(mail.sent).toHaveLength(0)
  })
})
