import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { recordAdministrativeDecision } from '@/features/appeals/adminAppeals'
import type { Actor } from '@/features/auth/actor'
import { makeApplication } from '@/test/applicationFixtures'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findUuids } from '@/test/leaks'
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

const { default: AppealsPage } = await import('./page')
const { default: ApplicationAppealsPage } = await import('./[applicationId]/page')
const { default: BoardsPage } = await import('../page')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let permit = { applicationId: '', number: '' }

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  permit = await makeApplication(handle.db, world, { state: 'issued' })
  const recorded = await recordAdministrativeDecision(
    handle.db,
    world.staff,
    {
      applicationNumber: permit.number,
      occurredOn: '2027-03-01' as CivilDate,
      now: BOARD_FIXTURE_NOW,
    },
    signal,
  )
  if (!recorded.ok) throw new Error(recorded.error)
})
afterAll(async () => {
  await handle.drop()
})

describe('the administrative appeals pages', () => {
  it('lists the decision with its appeal window and offers to record another', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await AppealsPage())
    expect(html).toContain('Appeals of administrative decisions')
    expect(html).toContain(permit.number)
    expect(html).toContain('Not appealed. The appeal window ends March 31, 2027.')
    expect(html).toContain('Record an administrative decision')
    expect(html).toContain(`href="/staff/boards/appeals/${permit.applicationId}"`)
  })

  it('shows one permit with its graph and the form to start the appeal', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(
      await ApplicationAppealsPage({
        params: Promise.resolve({ applicationId: permit.applicationId }),
      }),
    )
    expect(html).toContain('Administrative decision')
    expect(html).toContain('Appeal to the Zoning Board')
    expect(html).toContain('Who appealed')
    expect(html).toContain('Record the step')
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(findIsoDates(text)).toEqual([])
    expect(findUuids(text)).toEqual([])
  })

  it('is linked from the board applications page', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await BoardsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('href="/staff/boards/appeals"')
  })

  it('refuses a reviewer', async () => {
    state.actor = world.reviewer
    expect(renderToStaticMarkup(await AppealsPage())).toContain('You do not have permission')
  })
})
