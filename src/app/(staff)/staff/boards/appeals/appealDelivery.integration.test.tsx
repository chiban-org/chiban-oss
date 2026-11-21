import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { appealNodes } from '@/db/schema'
import { addAppealNode } from '@/features/appeals/graph'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { addAgentParty, FULL_PACK, HEARING_DATE } from '@/test/deliveryFixtures'
import type { CivilDate } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ApplicationAppealsPage } = await import('./[applicationId]/page')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let applicationId = ''

beforeAll(async () => {
  setActivePackForTest(FULL_PACK)
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: FULL_PACK,
    classificationKey: 'xx.board_variance',
  })
  await addAgentParty(handle.db, world)
  applicationId = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  const [appeal] = await handle.db
    .insert(appealNodes)
    .values({
      kind: 'zba_appeal',
      applicationId,
      occurredOn: '2027-04-01',
      createdBy: world.staff.userId,
    })
    .returning({ id: appealNodes.id })
  const added = await addAppealNode(
    handle.db,
    world.staff,
    {
      parentId: appeal?.id ?? '',
      kind: 'zba_decision',
      occurredOn: '2027-04-10' as CivilDate,
      outcome: 'approved',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!added.ok) throw new Error(added.error)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('the appeal step of a recorded decision', () => {
  it('shows the Delivery section with a form for each recipient', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(
      await ApplicationAppealsPage({ params: Promise.resolve({ applicationId }) }),
    )
    expect(html).toContain('Delivery')
    expect(html).toContain('Decision after appeal, April 10, 2027')
    expect(html).toContain('Due April 17, 2027.')
    expect(html).toContain('Pat Agent')
    expect(html).toContain('Record delivery to Pat Agent')
    expect(html).toContain('Date delivered')
  })
})
