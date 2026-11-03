import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { inspections, users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { addDays, type CivilDate } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

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

const { default: InspectionsPage } = await import('@/app/(staff)/staff/inspections/page')
const { default: DayPage } = await import('@/app/(staff)/staff/inspections/day/page')

const signal = new AbortController().signal
let handle: TestDb
let inspectorId = ''
let firstBooked = '' as CivilDate

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function html(element: Promise<unknown>): Promise<string> {
  return renderToStaticMarkup((await element) as never)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const [inspector] = await handle.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'inspector@alderpond.example'))
  inspectorId = inspector?.id ?? ''
  const [booked] = await handle.db
    .select({ date: inspections.scheduledDate })
    .from(inspections)
    .where(and(eq(inspections.inspectorUserId, inspectorId), isNotNull(inspections.scheduledDate)))
    .orderBy(asc(inspections.scheduledDate))
  firstBooked = (booked?.date ?? '') as CivilDate
})
afterAll(async () => {
  await handle.drop()
})

describe('the inspector day list', () => {
  it('opens on the first inspector for staff who are not inspectors, and says whose day it is', async () => {
    await actAs('staff')
    const body = await html(DayPage({ searchParams: Promise.resolve({}) }))
    expect(body).toContain('Ira Inspector')
    expect(body).toMatch(/aria-current="page"[^>]*>Ira Inspector</)
  })

  it('offers the next day with inspections when the day is empty', async () => {
    await actAs('staff')
    const before = addDays(firstBooked, -3)
    const body = await html(
      DayPage({ searchParams: Promise.resolve({ date: before, inspector: inspectorId }) }),
    )
    expect(body).toContain('No inspections on this day.')
    expect(body).toContain(`date=${firstBooked}&amp;inspector=${inspectorId}`)
  })

  it('tells an inspector the day is their own', async () => {
    await actAs('inspector')
    expect(await html(DayPage({ searchParams: Promise.resolve({}) }))).toContain('Your day')
  })
})

describe('the inspection board', () => {
  it('puts Take a request first when a permit number is given', async () => {
    await actAs('staff')
    const body = await html(
      InspectionsPage({ searchParams: Promise.resolve({ number: 'BP-2025-0001' }) }),
    )
    expect(body.indexOf('aria-label="Take a request"')).toBeGreaterThan(-1)
    expect(body.indexOf('aria-label="Take a request"')).toBeLessThan(
      body.indexOf('aria-label="Requests and bookings"'),
    )
  })
})
