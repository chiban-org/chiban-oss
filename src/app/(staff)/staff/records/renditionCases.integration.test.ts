import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { redactionJobs, renditionApprovals } from '@/db/schema'
import { approveRendition } from '@/features/renditions/approvals'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { lazy } from '@/test/boardPanelFixtures'
import { seedParcelWorld } from '@/test/parcels'
import { textCopy } from '@/test/recordsCases'
import { LETTER_PHONE_BOX, uploadRedactionFixture } from '@/test/redactionFixtures'
import { refusalFor } from '@/test/refusalCopy'
import { EXPLANATION, redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import {
  actionHarness,
  choice,
  describeActionCases,
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

const actions = await import('./renditionActions')
const redactActions = await import('./redact/actions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal
const staff = () => h.actorFor('staff')
const custodian = () => h.actorFor('records_custodian')

const source = lazy(async () => {
  await seedParcelWorld(h.db)
  return await uploadRedactionFixture(h.db, h.store, await staff(), 'letter.pdf')
})

const redacted = lazy(async () => {
  const doc = await source()
  return await redactedVersionOf(h.db, h.store, await staff(), doc)
})

const approval = lazy(async () => {
  const approved = await approveRendition(
    h.db,
    await staff(),
    { versionId: await redacted(), purpose: 'public', reviewStatement: STATEMENT },
    signal,
    h.store,
  )
  if (!approved.ok) throw new Error(`approve ${approved.error}`)
  return approved.value.approvalId
})

beforeAll(async () => {
  await source()
  await redacted()
  await approval()
})

describeActionCases(h, 'approveRenditionAction', {
  invoke: actions.approveRenditionAction,
  actor: staff,
  input: async () => ({
    versionId: await redacted(),
    purpose: 'public',
    reviewStatement: 'Checked every page against the boxes.',
  }),
  fields: {
    versionId: uuid({ required: true }),
    purpose: choice({ required: true }),
    rtkRequestId: uuid(),
    reviewStatement: text({ required: true, max: 2000 }),
  },
  capability: 'document.publish',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      versionId: 'Choose a version.',
      purpose: 'Choose what the version is approved for.',
      rtkRequestId: 'Choose a request.',
      reviewStatement: textCopy('a review statement', 2000),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Version approved.' })
    expect(written).toContain('rendition_approvals')
    expect((await db.select().from(renditionApprovals)).length).toBeGreaterThan(1)
  },
})

describe('approveRenditionAction statement', () => {
  it('names the review statement beside its field when it is only spaces', async () => {
    h.signIn(await staff())
    const form = h.form({ versionId: await redacted(), purpose: 'public', reviewStatement: '   ' })
    expect(await actions.approveRenditionAction(form)).toEqual(
      refuseField('reviewStatement', 'Enter a review statement.'),
    )
  })
})

describeActionCases(h, 'revokeApprovalAction', {
  invoke: actions.revokeApprovalAction,
  actor: staff,
  input: async () => ({ approvalId: await approval(), reason: 'The redaction missed a name' }),
  fields: { approvalId: uuid({ required: true }), reason: text({ required: true, max: 2000 }) },
  capability: 'document.publish',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      approvalId: 'Choose an approval.',
      reason: {
        missing: 'Enter a reason.',
        whitespace: 'Enter a reason.',
        otherwise: 'Enter a reason of 2000 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Approval revoked. The version is no longer served anywhere.',
    })
    expect(written).toContain('rendition_approvals')
    const [row] = await db
      .select()
      .from(renditionApprovals)
      .where(eq(renditionApprovals.id, input.approvalId))
    expect(row?.revokedAt).not.toBeNull()
  },
})

describe('revokeApprovalAction reason', () => {
  it('names the 10 character minimum beside the reason', async () => {
    h.signIn(await staff())
    const expected = refuseField('reason', 'Enter a reason of at least 10 characters.')
    const form = h.form({ approvalId: await approval(), reason: 'short' })
    expect(await actions.revokeApprovalAction(form)).toEqual(expected)
  })
})

const BOX = { pdf: LETTER_PHONE_BOX, exemptionKey: 'nh.rtk.91a5.iv', explanation: EXPLANATION }

describeActionCases(h, 'requestRedactionAction', {
  invoke: redactActions.requestRedactionAction,
  actor: custodian,
  input: async () => {
    const doc = await source()
    return {
      documentId: doc.documentId,
      sourceVersionId: doc.versionId,
      purpose: 'public',
      boxes: JSON.stringify([BOX]),
    }
  },
  fields: {
    documentId: uuid({ required: true }),
    sourceVersionId: uuid({ required: true }),
    purpose: choice({ required: true }),
    rtkRequestId: uuid(),
    boxes: text({ required: true }),
  },
  capability: 'redaction.create',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      documentId: 'Choose a document.',
      sourceVersionId: 'Choose a version.',
      purpose: 'Choose what the copy is for.',
      rtkRequestId: 'Choose a request.',
      boxes: 'Draw at least one box.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message:
        'Redacted copy made. Nothing is released or public until it is approved, as described below.',
    })
    expect(written).toContain('redaction_jobs')
    expect((await db.select().from(redactionJobs)).at(-1)?.status).toBe('complete')
  },
})

describe('requestRedactionAction boxes', () => {
  const attempt = async (boxes: string) => {
    h.signIn(await custodian())
    const doc = await source()
    const form = h.form({
      documentId: doc.documentId,
      sourceVersionId: doc.versionId,
      purpose: 'public',
      boxes,
    })
    return await h.recordWrites(() => redactActions.requestRedactionAction(form))
  }

  it('asks for a box beside the boxes when the list is empty', async () => {
    const { value, written } = await attempt('[]')
    expect(value).toEqual(refuseField('boxes', 'Draw at least one box.'))
    expect(written).toEqual([])
  })

  it('refuses boxes that cannot be read', async () => {
    expect((await attempt('{not json')).value).toEqual(
      refuseField('boxes', 'The boxes could not be read. Draw them again.'),
    )
  })

  it('refuses a box with no exemption beside the boxes', async () => {
    const { pdf, explanation } = BOX
    expect((await attempt(JSON.stringify([{ pdf, explanation }]))).value).toEqual(
      refuseField(
        'boxes',
        'Choose an exemption from the list for every withheld or redacted record.',
      ),
    )
  })
})
