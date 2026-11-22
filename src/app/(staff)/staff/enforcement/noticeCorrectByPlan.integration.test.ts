import { ME_PACK } from '@packs/me'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { violationNotices } from '@/db/schema'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { planCaseWork } from '@/features/enforcement/workPlan'
import { setActivePackForTest } from '@/features/packs/registry'
import { ALL_CASE_ABILITIES } from '@/test/casePlan'
import { caseWithFinding } from '@/test/enforcementActionFixtures'
import { useEnforcementClock } from '@/test/enforcementCases'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { actionHarness } from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

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
const signal = new AbortController().signal
const TODAY = '2027-07-20' as CivilDate
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})
afterEach(() => {
  setActivePackForTest(null)
})

async function noticedCase(correctBy: string): Promise<string> {
  h.signIn(world.staff)
  const { caseId, findingId } = await caseWithFinding(h.db, world, '17 Wren Hollow')
  const sent = await actions.sendNoticeAction(
    h.form({
      caseId,
      findingIds: [findingId],
      sentOn: '2027-07-03',
      method: 'certified_mail',
      recipientName: 'Ivo Tallant',
      recipientAddress: '3 Birch Lane, Vellmora',
      correctBy,
    }),
  )
  expect(sent).toEqual({ ok: true, message: 'Notice of violation recorded.' })
  const [notice] = await h.db
    .select({ id: violationNotices.id })
    .from(violationNotices)
    .where(eq(violationNotices.caseId, caseId))
  const received = await actions.recordNoticeReceiptAction(
    h.form({ noticeId: notice?.id ?? '', receivedOn: '2027-07-06', basis: 'Green card returned' }),
  )
  expect(received).toEqual({ ok: true, message: 'Receipt recorded.' })
  return caseId
}

async function nowStep(caseId: string) {
  const detail = await loadCaseDetail(h.db, world.staff, caseId, TODAY, signal)
  if (!detail.ok) throw new Error(detail.error)
  return planCaseWork(detail.value, { abilities: ALL_CASE_ABILITIES, responsible: null }).now
}

describe('a notice of violation recorded with a correct by date through the form', () => {
  it('makes a Maine case plan wait until that date', async () => {
    setActivePackForTest(ME_PACK)
    const step = await nowStep(await noticedCase('2027-08-15'))
    expect(step).toMatchObject({
      key: 'notice.correct_by',
      task: 'Wait for the correction date, August 15, 2027',
      action: null,
    })
  })

  it('moves on once the date has passed', async () => {
    setActivePackForTest(ME_PACK)
    const step = await nowStep(await noticedCase('2027-07-10'))
    expect(step?.key).not.toBe('notice.correct_by')
  })
})
