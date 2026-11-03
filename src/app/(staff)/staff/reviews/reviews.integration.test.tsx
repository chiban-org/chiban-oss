import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('./actions')
const { default: ApplicationsPage } = await import('@/app/(staff)/staff/applications/page')
const { default: ReviewsPage } = await import('./page')
const { default: ReviewPage } = await import('./[assignmentId]/page')

let handle: TestDb
let world: PermitWorld
const apps: string[] = []

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  for (let i = 0; i < 4; i += 1) {
    apps.push((await makeApplication(handle.db, world, { state: 'submitted' })).applicationId)
  }
})
afterAll(async () => {
  await handle.drop()
})

describe('reviewer assignment actions and pages', () => {
  it('a reviewer cannot assign reviewers, staff can', async () => {
    state.actor = world.reviewer
    const refused = await actions.assignReviewerAction(
      form({ applicationId: apps[0] ?? '', reviewerUserId: world.reviewer.userId }),
    )
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    state.actor = world.staff
    for (const id of apps.slice(0, 2)) {
      const ok = await actions.assignReviewerAction(
        form({ applicationId: id, reviewerUserId: world.reviewer.userId }),
      )
      expect(ok).toEqual({ ok: true, message: 'Reviewer assigned.' })
    }
  })

  it('the reviewer application list shows only the 2 assigned of 4, and the review page is theirs alone', async () => {
    state.actor = world.reviewer
    const html = renderToStaticMarkup(await ApplicationsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('2 applications')
    const mine = renderToStaticMarkup(await ReviewsPage())
    const assignmentId = /reviews\/([0-9a-f-]{36})/.exec(mine)?.[1] ?? ''
    expect(assignmentId).not.toBe('')
    const page = renderToStaticMarkup(
      await ReviewPage({ params: Promise.resolve({ assignmentId }) }),
    )
    expect(page).toContain('Sign off')
    expect(page).toContain('Garage addition')
    expect(page).toContain('007001000000')
    const rail = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'))
    expect(rail).toContain('aria-label="Next step"')
    expect(rail).toContain('>Sign off<')
    expect(rail).toContain('Comments due')
    expect(page).toContain(`href="/staff/parcels/${world.parcelId}"`)
    expect(page).toMatch(/href="\/staff\/applications\/[0-9a-f-]{36}"/)
    state.actor = await staffActor(handle.db, 'reviewer')
    await expect(ReviewPage({ params: Promise.resolve({ assignmentId }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    const signOff = await actions.signOffReviewAction(form({ assignmentId }))
    expect(signOff).toMatchObject({ ok: false })
  })

  it('an applicant cannot open the staff application list', async () => {
    state.actor = world.applicant
    await expect(ApplicationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/staff/sign-in',
    )
  })
})
