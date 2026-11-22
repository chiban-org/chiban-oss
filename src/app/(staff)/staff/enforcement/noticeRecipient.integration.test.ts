import { ME_PACK } from '@packs/me'
import { ME_PENALTY_KEY } from '@packs/me/rules/enforcement'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { violationNotices } from '@/db/schema'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import { refuseField } from '@/server/formInput'
import { caseWithFinding } from '@/test/enforcementActionFixtures'
import { useEnforcementClock } from '@/test/enforcementCases'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { downloadObject } from '@/test/objectBytes'
import { XX_PACK } from '@/test/packs/xx'
import { pdfWording } from '@/test/pdfWording'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./findingActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})
afterEach(() => {
  setActivePackForTest(null)
})

async function noticeText(caseId: string): Promise<string> {
  const [row] = await h.db
    .select({ documentId: violationNotices.documentId })
    .from(violationNotices)
    .where(eq(violationNotices.caseId, caseId))
  if (row?.documentId == null) throw new Error('no notice document')
  return (await pdfWording(await downloadObject(h.db, h.store, row.documentId))).replace(
    /\s+/g,
    ' ',
  )
}

describe('a notice of violation with a recipient and a correct by date', () => {
  it('stores both and prints the recipient and the date on the notice', async () => {
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '41 Heron Way')
    const result = await actions.sendNoticeAction(
      h.form({
        caseId,
        findingIds: [findingId],
        sentOn: '2027-07-03',
        method: 'certified_mail',
        recipientName: 'Wren Ashdown',
        recipientAddress: '8 Quarry Hill Road, Fernhollow',
        correctBy: '2027-08-15',
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Notice of violation recorded.' })
    const [row] = await h.db
      .select({
        name: violationNotices.recipientName,
        address: violationNotices.recipientAddress,
        correctBy: violationNotices.correctBy,
      })
      .from(violationNotices)
      .where(eq(violationNotices.caseId, caseId))
    expect(row).toEqual({
      name: 'Wren Ashdown',
      address: '8 Quarry Hill Road, Fernhollow',
      correctBy: '2027-08-15',
    })
    const text = await noticeText(caseId)
    expect(text).toContain('To Wren Ashdown, 8 Quarry Hill Road, Fernhollow')
    expect(text).toContain('Correct the violation by August 15, 2027.')
    expect(text).not.toContain('Authority')
  })

  it('prints no recipient or correct by line when both are blank', async () => {
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '42 Heron Way')
    const result = await actions.sendNoticeAction(
      h.form({
        caseId,
        findingIds: [findingId],
        sentOn: '2027-07-03',
        method: 'first_class_mail',
        recipientName: '',
        recipientAddress: '',
        correctBy: '',
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Notice of violation recorded.' })
    const text = await noticeText(caseId)
    expect(text).not.toContain('To ')
    expect(text).not.toContain('Correct the violation by')
  })

  it('refuses a correct by date before the date sent beside the date', async () => {
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '43 Heron Way')
    const { value, written } = await h.recordWrites(() =>
      actions.sendNoticeAction(
        h.form({
          caseId,
          findingIds: [findingId],
          sentOn: '2027-07-03',
          method: 'in_hand',
          correctBy: '2027-07-02',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('correctBy', 'The correct by date is before the date sent.'),
      written: [],
    })
  })
})

describe('a Maine notice of violation', () => {
  it('prints the penalty authority and says the violation was found', async () => {
    setActivePackForTest(ME_PACK)
    const penalty = ruleByKey(loadPack(), ME_PENALTY_KEY)
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '44 Heron Way')
    const result = await actions.sendNoticeAction(
      h.form({ caseId, findingIds: [findingId], sentOn: '2027-07-03', method: 'certified_mail' }),
    )
    expect(result).toEqual({ ok: true, message: 'Notice of violation recorded.' })
    const text = await noticeText(caseId)
    expect(penalty.citation.label).toBe('30-A MRSA §4452(3)')
    expect(text).toContain(`Authority ${penalty.citation.label}`)
    expect(text).toContain(
      'The town has found a violation at this property. This notice describes what was found.',
    )
    expect(text).not.toMatch(/possible/i)
  })
})

async function sentNoticeText(location: string): Promise<string> {
  h.signIn(world.staff)
  const { caseId, findingId } = await caseWithFinding(h.db, world, location)
  const result = await actions.sendNoticeAction(
    h.form({ caseId, findingIds: [findingId], sentOn: '2027-07-03', method: 'certified_mail' }),
  )
  expect(result).toEqual({ ok: true, message: 'Notice of violation recorded.' })
  return await noticeText(caseId)
}

describe('the appeal route on a notice of violation', () => {
  it('prints the Maine route to the Board of Appeals with the town period', async () => {
    setActivePackForTest(ME_PACK)
    const text = await sentNoticeText('46 Heron Way')
    expect(text).toContain(
      'How to appeal Appeal of an administrative decision to the Board of Appeals: within 30 days after the decision (30-A MRSA §4353(1)).',
    )
  })

  it('prints the New Hampshire route to the ZBA', async () => {
    const text = await sentNoticeText('48 Heron Way')
    expect(text).toContain(
      'How to appeal Appeal of an administrative decision to the ZBA: within 30 days after the decision (RSA 676:5 I).',
    )
  })

  it('prints nothing about an appeal when the pack has no route', async () => {
    setActivePackForTest(XX_PACK)
    const text = await sentNoticeText('50 Heron Way')
    expect(text).not.toMatch(/appeal/i)
  })
})
