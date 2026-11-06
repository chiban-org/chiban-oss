import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { complaints, enforcementCases } from '@/db/schema'
import { recordComplaint } from '@/features/enforcement/complaints'
import { publishCase } from '@/features/enforcement/publicText'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { intakeCase } from '@/test/enforcementActionFixtures'
import { useEnforcementClock } from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./publishActions')

const h = actionHarness()
useEnforcementClock()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const caseRow = (id: string) =>
  h.db
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.id, id))
    .then((rows) => rows[0])

async function complaintOn(location: string) {
  const recorded = await recordComplaint(
    h.db,
    world.staff,
    { channel: 'staff_entry', locationText: location, description: 'Trucks idle all night.' },
    signal,
    FIXTURE_NOW,
  )
  if (!recorded.ok) throw new Error(recorded.error)
  return recorded.value
}

const forPublicText = lazy(() => complaintOn('51 Maple Street'))

describeActionCases(h, 'complaintPublicTextAction', {
  invoke: actions.complaintPublicTextAction,
  actor: () => world.staff,
  input: async () => ({
    complaintId: (await forPublicText()).complaintId,
    text: 'Vehicles are idling overnight near the road.',
  }),
  fields: { complaintId: uuid({ required: true }), text: text({ required: true, max: 5000 }) },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant: InvalidVariant) =>
      variant.field === 'complaintId'
        ? refuseField('complaintId', idMessage('a complaint'))
        : refuseField('text', textMessage('the public text', 5000, variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Public text saved.' })
    const [row] = await db
      .select({ text: complaints.descriptionPublic })
      .from(complaints)
      .where(eq(complaints.id, (await forPublicText()).complaintId))
    expect(row?.text).toBe('Vehicles are idling overnight near the road.')
  },
})

const forPublish = lazy(() => intakeCase(h.db, world, '52 Maple Street'))

describeActionCases(h, 'publishCaseAction', {
  invoke: actions.publishCaseAction,
  actor: () => world.staff,
  input: async () => ({
    caseId: (await forPublish()).caseId,
    summary: 'A stop-work order was issued for unpermitted construction.',
  }),
  fields: { caseId: uuid({ required: true }), summary: text({ required: true, max: 1000 }) },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant: InvalidVariant) =>
      variant.field === 'caseId'
        ? refuseField('caseId', idMessage('a case'))
        : refuseField('summary', textMessage('a public summary', 1000, variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'The case is now public.' })
    expect(await caseRow((await forPublish()).caseId)).toMatchObject({
      isPublic: true,
      publicSummary: 'A stop-work order was issued for unpermitted construction.',
    })
  },
})

describe('publishCaseAction with a complaint still unreviewed', () => {
  it('says to write the public text first and publishes nothing', async () => {
    h.signIn(world.staff)
    const { caseId } = await complaintOn('53 Maple Street')
    const { value, written } = await h.recordWrites(() =>
      actions.publishCaseAction(h.form({ caseId, summary: 'A complaint was received.' })),
    )
    expect({ value, written }).toEqual({
      value: {
        ok: false,
        error: 'Write the public text for every complaint before publishing the case.',
      },
      written: [],
    })
  })
})

const forUnpublish = lazy(async () => {
  const { caseId } = await intakeCase(h.db, world, '54 Maple Street')
  const published = await publishCase(h.db, world.staff, { caseId, summary: 'Public.' }, signal)
  if (!published.ok) throw new Error(published.error)
  return caseId
})

describeActionCases(h, 'unpublishCaseAction', {
  invoke: actions.unpublishCaseAction,
  actor: () => world.staff,
  input: async () => ({ caseId: await forUnpublish() }),
  fields: { caseId: uuid({ required: true }) },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('caseId', idMessage('a case')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'The case is no longer public.' })
    expect((await caseRow(await forUnpublish()))?.isPublic).toBe(false)
  },
})
