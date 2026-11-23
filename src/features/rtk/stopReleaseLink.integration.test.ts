import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renditionApprovals, rtkReleaseItems } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import { openReleaseVersion } from '@/features/rtk/releaseLinks'
import { createRelease, type ReleaseInput } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { stopReleaseLink } from '@/features/rtk/stopReleaseLink'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const REASON = 'The redaction missed a neighbour name'
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let requestId: string
let mail: ReturnType<typeof createMemoryTransport>

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  mail = createMemoryTransport()
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: '2027-07-02',
      receivedVia: 'email',
      requesterName: 'Marlo Quist',
      requesterContact: 'marlo@example.test',
      description: 'The Fernhollow culvert letters',
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

async function released(extra: Partial<ReleaseInput>) {
  const doc = await uploadRedactionFixture(
    handle.db,
    store,
    custodian,
    'letter.pdf',
    undefined,
    false,
  )
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
  if (!approved.ok) throw new Error(approved.error)
  const made = await createRelease(
    handle.db,
    store,
    mail,
    custodian,
    {
      requestId,
      releasedOn: '2027-07-09',
      method: 'paper',
      items: [{ documentId: doc.documentId, approvalId: approved.value.approvalId }],
      ...extra,
    },
    signal,
    NOW,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  const token =
    /\/records\/releases\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
  return { approvalId: approved.value.approvalId, redactedId, token }
}

async function revokedAt(approvalId: string): Promise<Date | null> {
  const [row] = await handle.db
    .select({ revokedAt: renditionApprovals.revokedAt })
    .from(renditionApprovals)
    .where(eq(renditionApprovals.id, approvalId))
  return row?.revokedAt ?? null
}

describe('stopping the download link of a released copy', () => {
  it('refuses the link download afterwards', async () => {
    const copy = await released({ method: 'electronic_link', recipientEmail: 'marlo@example.test' })
    expect((await openReleaseVersion(handle.db, copy.token, copy.redactedId, NOW, signal)).ok).toBe(
      true,
    )
    const stopped = await stopReleaseLink(
      handle.db,
      custodian,
      { approvalId: copy.approvalId, reason: REASON },
      signal,
      store,
    )
    expect(stopped).toEqual({ ok: true, value: undefined })
    expect(await openReleaseVersion(handle.db, copy.token, copy.redactedId, NOW, signal)).toEqual({
      ok: false,
      error: { withdrawnOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
  })

  it.each([
    'paper',
    'email',
    'inspection',
  ] as const)('refuses a copy released by %s and leaves its approval in place', async (method) => {
    const copy = await released(
      method === 'email' ? { method, recipientEmail: 'marlo@example.test' } : { method },
    )
    expect(
      await stopReleaseLink(
        handle.db,
        custodian,
        { approvalId: copy.approvalId, reason: REASON },
        signal,
        store,
      ),
    ).toEqual({ ok: false, error: 'not_link_release' })
    expect(await revokedAt(copy.approvalId)).toBeNull()
  })
})

describe('revoking an approval whose copy was already released', () => {
  it.each([
    'paper',
    'email',
    'inspection',
  ] as const)('refuses a copy released by %s and leaves the approval in place', async (method) => {
    const copy = await released(
      method === 'email' ? { method, recipientEmail: 'marlo@example.test' } : { method },
    )
    expect(
      await revokeApproval(
        handle.db,
        custodian,
        { approvalId: copy.approvalId, reason: REASON },
        signal,
        store,
      ),
    ).toEqual({ ok: false, error: 'released_offline' })
    expect(await revokedAt(copy.approvalId)).toBeNull()
  })

  it('still revokes a copy released by link', async () => {
    const copy = await released({ method: 'electronic_link', recipientEmail: 'marlo@example.test' })
    expect(
      await revokeApproval(
        handle.db,
        custodian,
        { approvalId: copy.approvalId, reason: REASON },
        signal,
        store,
      ),
    ).toEqual({ ok: true, value: undefined })
    expect(await revokedAt(copy.approvalId)).not.toBeNull()
  })
})

describe('revoking a public approval of a version a requester got on paper', () => {
  it('revokes only the public approval and leaves the requester copy alone', async () => {
    const doc = await uploadRedactionFixture(
      handle.db,
      store,
      custodian,
      'letter.pdf',
      undefined,
      false,
    )
    const forRequest = await approveRendition(
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
    if (!forRequest.ok) throw new Error(forRequest.error)
    const made = await createRelease(
      handle.db,
      store,
      mail,
      custodian,
      {
        requestId,
        releasedOn: '2027-07-09',
        method: 'paper',
        items: [{ documentId: doc.documentId, approvalId: forRequest.value.approvalId }],
      },
      signal,
      NOW,
    )
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const forPublic = await approveRendition(
      handle.db,
      custodian,
      { versionId: doc.versionId, purpose: 'public', reviewStatement: STATEMENT },
      signal,
      store,
    )
    if (!forPublic.ok) throw new Error(forPublic.error)
    expect(
      await revokeApproval(
        handle.db,
        custodian,
        { approvalId: forPublic.value.approvalId, reason: REASON },
        signal,
        store,
      ),
    ).toEqual({ ok: true, value: undefined })
    expect(await revokedAt(forPublic.value.approvalId)).not.toBeNull()
    expect(await revokedAt(forRequest.value.approvalId)).toBeNull()
    const [item] = await handle.db
      .select({ withdrawnAt: rtkReleaseItems.withdrawnAt })
      .from(rtkReleaseItems)
      .where(eq(rtkReleaseItems.approvalId, forRequest.value.approvalId))
    expect(item).toEqual({ withdrawnAt: null })
  })
})
