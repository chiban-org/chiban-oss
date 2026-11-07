import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documents, preservationRecords } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { textCopy } from '@/test/recordsCases'
import { RECORDS_NOW } from '@/test/recordsClock'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
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

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
let world: PermitWorld
let documentId = ''
let preservationRecordId = ''

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  const app = await makeApplication(h.db, world)
  const uploaded = await uploadAs(
    h.db,
    h.store,
    world.applicant,
    { kind: 'application', id: app.applicationId },
    pdfBytes('records'),
  )
  documentId = uploaded.documentId
  const [record] = await h.db
    .update(preservationRecords)
    .set({ status: 'incomplete' })
    .where(eq(preservationRecords.originalVersionId, uploaded.versionId))
    .returning({ id: preservationRecords.id })
  preservationRecordId = record?.id ?? ''
  vi.useFakeTimers({ toFake: ['Date'], now: RECORDS_NOW })
})
afterAll(() => {
  vi.useRealTimers()
})

const manager = () => h.actorFor('records_custodian')

describeActionCases(h, 'setAudiencesAction', {
  invoke: actions.setAudiencesAction,
  actor: manager,
  input: () => ({ documentId, audience: ['project_parties', 'board'] }),
  fields: { documentId: uuid({ required: true }) },
  capability: 'document.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ documentId: 'Choose a document.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Audiences saved.' })
    expect(written).toEqual(['audit_log', 'documents'])
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc?.audiences).toEqual(['project_parties', 'board'])
  },
})

describe('setAudiencesAction audiences', () => {
  const attempt = async (audience: string[]) => {
    h.signIn(await manager())
    return await actions.setAudiencesAction(h.form({ documentId, audience }))
  }

  it('refuses an audience that is not on the list, beside the audiences', async () => {
    expect(await attempt(['board', 'everyone'])).toEqual(
      refuseField('audience', 'Choose from the audiences listed.'),
    )
  })

  it('clears every audience when none is ticked', async () => {
    expect(await attempt([])).toEqual({ ok: true, message: 'Audiences saved.' })
    const [doc] = await h.db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc?.audiences).toEqual([])
  })
})

describeActionCases(h, 'setPublicAction', {
  invoke: actions.setPublicAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ documentId }),
  fields: { documentId: uuid({ required: true }) },
  capability: 'document.publish',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ documentId: 'Choose a document.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Saved. The document is hidden from the public site.',
    })
    expect(written).toEqual(['audit_log', 'documents'])
  },
})

describe('setPublicAction publishing', () => {
  it('asks for an approved version before a document goes public', async () => {
    h.signIn(await h.actorFor('staff'))
    const { value, written } = await h.recordWrites(() =>
      actions.setPublicAction(h.form({ documentId, isPublic: 'yes' })),
    )
    expect(value).toEqual({
      ok: false,
      error: 'Approve a version for the public before showing this document on the public site.',
    })
    expect(written).toEqual([])
  })
})

describeActionCases(h, 'assignSeriesAction', {
  invoke: actions.assignSeriesAction,
  actor: manager,
  input: () => ({ documentId, seriesKey: 'nh.rs.blueprints_architectural' }),
  fields: { documentId: uuid({ required: true }), seriesKey: text({ required: true, max: 100 }) },
  capability: 'document.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      documentId: 'Choose a document.',
      seriesKey: textCopy('a record series', 100),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Record series saved.' })
    expect(written).toContain('retention_assignments')
  },
})

describe('assignSeriesAction series', () => {
  it('refuses a series that is not on the list, beside the series', async () => {
    h.signIn(await manager())
    expect(
      await actions.assignSeriesAction(h.form({ documentId, seriesKey: 'made.up.series' })),
    ).toEqual(refuseField('seriesKey', 'Choose a record series from the list.'))
  })
})

describeActionCases(h, 'retryPreservationAction', {
  invoke: actions.retryPreservationAction,
  actor: manager,
  input: () => ({ recordId: preservationRecordId }),
  fields: { recordId: uuid({ required: true }) },
  capability: 'document.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ recordId: 'Choose a preservation record.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Preservation will be tried again within a minute.',
    })
    expect(written).toContain('preservation_records')
  },
})
