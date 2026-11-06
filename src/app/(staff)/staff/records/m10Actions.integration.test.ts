import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispositionBatches, redactionJobs, renditionApprovals, rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { LETTER_PHONE_BOX, uploadRedactionFixture } from '@/test/redactionFixtures'
import { EXPLANATION, redactedVersionOf } from '@/test/renditionFixtures'

interface MockState {
  db: unknown
  csrf: string | null
  actor: Actor | null
  store: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrf: 'tok', actor: null, store: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrf !== null ? { value: state.csrf } : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/storage/objectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))

const requestActions = await import('./requests/actions')
const renditionActions = await import('./renditionActions')
const redactActions = await import('./redact/actions')
const retentionActions = await import('./retention/actions')

let handle: TestDb
let store: ObjectStore
let custodian: Actor
let reviewer: Actor
let staff: Actor
let doc: { documentId: string; versionId: string }

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  store = (await makeTestStore()).store
  state.store = store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  reviewer = await staffActor(handle.db, 'reviewer')
  staff = await staffActor(handle.db, 'staff')
  doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrf = 'tok'
  state.actor = custodian
})

const LOG = {
  receivedOn: '2026-10-30',
  receivedVia: 'email',
  description: 'All permits on Birch Lane',
}

describe('records server actions', () => {
  it('approveRenditionAction without a csrf token is refused', async () => {
    const result = await renditionActions.approveRenditionAction(
      form(
        { versionId: doc.versionId, purpose: 'public', reviewStatement: 'Checked every page' },
        null,
      ),
    )
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('expired') })
  })

  it('approval by a reviewer is forbidden via server action', async () => {
    state.actor = reviewer
    const result = await renditionActions.approveRenditionAction(
      form({ versionId: doc.versionId, purpose: 'public', reviewStatement: 'Checked every page' }),
    )
    expect(result).toMatchObject({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('revokeApprovalAction needs a reason and the right to revoke', async () => {
    const [approval] = await handle.db.select().from(renditionApprovals)
    state.actor = staff
    expect(
      await renditionActions.revokeApprovalAction(
        form({ approvalId: approval?.id ?? '', reason: 'short' }),
      ),
    ).toMatchObject({ ok: false, error: 'Enter a reason of at least 10 characters.' })
    state.actor = reviewer
    expect(
      await renditionActions.revokeApprovalAction(
        form({ approvalId: approval?.id ?? '', reason: 'This leaked a name' }),
      ),
    ).toMatchObject({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('reviewer without redaction.create is forbidden via server action', async () => {
    state.actor = reviewer
    const boxes = JSON.stringify([
      { pdf: LETTER_PHONE_BOX, exemptionKey: 'nh.rtk.91a5.iv', explanation: EXPLANATION },
    ])
    const result = await redactActions.requestRedactionAction(
      form({
        documentId: doc.documentId,
        sourceVersionId: doc.versionId,
        purpose: 'public',
        boxes,
      }),
    )
    expect(result).toMatchObject({ ok: false, error: 'You do not have permission to do this.' })
    expect(await handle.db.select().from(redactionJobs)).toEqual([])
  })

  it('the redaction action makes the redacted copy, and a box without an exemption is refused', async () => {
    const refused = await redactActions.requestRedactionAction(
      form({
        documentId: doc.documentId,
        sourceVersionId: doc.versionId,
        purpose: 'public',
        boxes: JSON.stringify([{ pdf: LETTER_PHONE_BOX, explanation: EXPLANATION }]),
      }),
    )
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('exemption') })
    const made = await redactActions.requestRedactionAction(
      form({
        documentId: doc.documentId,
        sourceVersionId: doc.versionId,
        purpose: 'public',
        boxes: JSON.stringify([
          { pdf: LETTER_PHONE_BOX, exemptionKey: 'nh.rtk.91a5.iv', explanation: EXPLANATION },
        ]),
      }),
    )
    expect(made).toMatchObject({ ok: true })
    const [job] = await handle.db.select().from(redactionJobs)
    expect(job?.status).toBe('complete')
  })

  it('logRequestAction logs a request and rejects a malformed date, and a reviewer cannot log', async () => {
    expect(await requestActions.logRequestAction(form(LOG))).toMatchObject({ ok: true })
    const [row] = await handle.db.select().from(rtkRequests)
    expect(row?.responseDue.due).toBe('2026-11-09')
    expect(
      await requestActions.logRequestAction(form({ ...LOG, receivedOn: 'yesterday' })),
    ).toMatchObject({ ok: false })
    state.actor = reviewer
    expect(await requestActions.logRequestAction(form(LOG))).toMatchObject({
      ok: false,
      error: 'You do not have permission to do this.',
    })
  })

  it('withholdingAction explains what is missing in plain words', async () => {
    const [row] = await handle.db.select().from(rtkRequests)
    const base = {
      requestId: row?.id ?? '',
      scope: 'withheld_in_full',
      recordDescription: 'Email from the town attorney',
      exemptionKey: 'nh.rtk.91a5.xii',
    }
    expect(
      await requestActions.withholdingAction(form({ ...base, explanation: 'too short' })),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('at least 20 characters'),
    })
    expect(
      await requestActions.withholdingAction(
        form({
          ...base,
          exemptionKey: '',
          explanation: 'The email is a confidential communication seeking legal advice.',
        }),
      ),
    ).toEqual({
      ok: false,
      error: 'Choose an exemption from the list for every withheld or redacted record.',
    })
  })

  it('a release with no record ticked says to tick one', async () => {
    const [row] = await handle.db.select().from(rtkRequests)
    expect(
      await requestActions.createReleaseAction(
        form({
          requestId: row?.id ?? '',
          releasedOn: '2026-10-30',
          method: 'electronic_link',
          recipientEmail: 'jordan@example.test',
        }),
      ),
    ).toMatchObject({ ok: false, error: 'Tick at least one approved record to release.' })
  })

  it('retention actions need the custodian for approval and the actor for proposals', async () => {
    state.actor = reviewer
    expect(
      await retentionActions.proposeDispositionAction(form({ asOf: '2026-10-01' })),
    ).toMatchObject({ ok: false, error: 'You do not have permission to do this.' })
    state.actor = staff
    expect(
      await retentionActions.proposeDispositionAction(form({ asOf: '2026-10-01' })),
    ).toMatchObject({
      ok: false,
      error: 'No records are eligible on that date.',
    })
    const [batch] = await handle.db.select().from(dispositionBatches)
    expect(batch).toBeUndefined()
    expect(redactedVersionOf).toBeDefined()
  })

  it('a stale session without csrf cannot approve a batch', async () => {
    state.csrf = null
    expect(
      await retentionActions.approveDispositionAction(
        form({ batchId: '00000000-0000-4000-8000-000000000000' }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('expired') })
  })
})
