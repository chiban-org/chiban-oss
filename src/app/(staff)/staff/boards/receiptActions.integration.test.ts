import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { remediationTasks } from '@/db/schema'
import { STALE_LIST_TASK_KIND } from '@/features/abutters/staleList'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  type BoardWorld,
  publishRegionalContacts,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import { XX_PB_SUBDIVISION_KEY, XX_RECEIPT_NOTICES } from '@/test/packs/xx/variants'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const actions = await import('./receiptActions')

const h = actionHarness()
let world: BoardWorld
let applicationId: string

beforeAll(async () => {
  setActivePackForTest(XX_RECEIPT_NOTICES)
  world = await setupBoardWorld(h.db, {
    pack: XX_RECEIPT_NOTICES,
    classificationKey: XX_PB_SUBDIVISION_KEY,
  })
  await publishRegionalContacts(h.db, world)
  applicationId = await submitBoardApplication(h.db, world, world.zbaTypeKey, '2027-03-02')
  await issueListWithRecipients(h.db, world, applicationId, [
    recipient(1),
    recipient(2, ['municipal_clerk']),
  ])
})
afterAll(() => {
  setActivePackForTest(null)
})

describe('receipt notices after the municipalities change', () => {
  it('asks for a new list, names the change on the task and explains the refusal', async () => {
    h.signIn(world.staff)
    const recorded = await actions.applicationMunicipalitiesAction(
      h.form({ applicationId, abuttingKeys: 'pine_river' }),
    )
    expect(recorded).toEqual({
      ok: true,
      message: 'Municipalities recorded. Draw and issue a new list.',
    })
    const [task] = await h.db
      .select({ description: remediationTasks.description })
      .from(remediationTasks)
      .where(
        and(
          eq(remediationTasks.applicationId, applicationId),
          eq(remediationTasks.kind, STALE_LIST_TASK_KIND),
        ),
      )
    expect(task?.description).toBe('Regenerate the abutter list: the municipalities changed')
    expect(await actions.prepareReceiptNoticesAction(h.form({ applicationId }))).toEqual({
      ok: false,
      error:
        'The abutter list was drawn before the municipalities or water supplier changed. Draw and issue a new list first.',
    })
  })
})
