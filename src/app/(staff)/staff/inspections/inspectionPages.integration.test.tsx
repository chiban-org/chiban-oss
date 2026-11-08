import { and, asc, eq, isNotNull, lt } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, inspections, users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
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
const { default: OwedPage } = await import('@/app/(staff)/staff/inspections/owed/page')
const { default: InspectionPage } = await import(
  '@/app/(staff)/staff/inspections/[inspectionId]/page'
)

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
  it('asks staff who are not inspectors to choose an inspector, then names whose day it is', async () => {
    await actAs('staff')
    const picker = await html(DayPage({ searchParams: Promise.resolve({}) }))
    expect(picker).toContain('Choose an inspector')
    expect(picker).toContain('Ira Inspector')
    const chosen = await html(
      DayPage({ searchParams: Promise.resolve({ inspector: inspectorId }) }),
    )
    expect(chosen).toContain('Ira Inspector')
    expect(chosen).not.toContain('Your day')
    expect(chosen).toContain('aria-labelledby="inspector-switch"')
    expect(chosen).toContain('>Inspector</p>')
    expect(chosen).toContain('Dana Booth')
  })

  it('marks the chosen inspector when there is more than one to choose from', async () => {
    await makeUser(handle.db, { role: 'inspector' })
    await actAs('staff')
    const body = await html(DayPage({ searchParams: Promise.resolve({ inspector: inspectorId }) }))
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

  it('says to enter a permit number when Find permit is pressed with the box empty or blank', async () => {
    await actAs('staff')
    for (const number of ['', '   ']) {
      const body = await html(InspectionsPage({ searchParams: Promise.resolve({ number }) }))
      expect(body).toContain('Enter a permit number.')
    }
  })

  it('does not scold before a permit number has been looked up', async () => {
    await actAs('staff')
    const body = await html(InspectionsPage({ searchParams: Promise.resolve({}) }))
    expect(body).not.toContain('Enter a permit number.')
  })

  it('opens with a lead line, the day list link in the header, and Take a request above the queue', async () => {
    await actAs('staff')
    const body = await html(InspectionsPage({ searchParams: Promise.resolve({}) }))
    const header = body.slice(body.indexOf('<header'), body.indexOf('</header>'))
    expect(header).toContain('Requests are listed oldest first')
    expect(header).toContain('href="/staff/inspections/day"')
    expect(body).toContain('<main data-wide')
    expect(body.indexOf('aria-label="Take a request"')).toBeGreaterThan(-1)
    expect(body.indexOf('aria-label="Take a request"')).toBeLessThan(
      body.indexOf('aria-label="Requests and bookings"'),
    )
    expect(body.indexOf('aria-label="Requests and bookings"')).toBeLessThan(
      body.indexOf('aria-label="Open slots"'),
    )
  })

  it('refuses a viewer without the scheduling capability', async () => {
    await actAs('admin')
    const body = await html(InspectionsPage({ searchParams: Promise.resolve({}) }))
    expect(body).toContain('You do not have permission to schedule inspections.')
    expect(body).not.toContain('aria-label="Open slots"')
  })

  it('opens for an inspector', async () => {
    await actAs('inspector')
    const body = await html(InspectionsPage({ searchParams: Promise.resolve({}) }))
    expect(body).toContain('aria-label="Open slots"')
  })
})

describe('an inspection', () => {
  it('links its permit number to the permit, once', async () => {
    await actAs('staff')
    const [row] = await handle.db
      .select({ id: inspections.id, applicationId: inspections.applicationId })
      .from(inspections)
      .where(eq(inspections.inspectorUserId, inspectorId))
    const body = await html(
      InspectionPage({ params: Promise.resolve({ inspectionId: row?.id ?? '' }) }),
    )
    expect(body).toMatch(
      new RegExp(`href="/staff/applications/${row?.applicationId}"[^>]*>[A-Z]+-\\d{4}-\\d{4}<`),
    )
    expect(body).not.toContain('Open the permit')
  })

  it('says the public parcel page lists a scheduled, passed or failed inspection and no other', async () => {
    await actAs('staff')
    const rows = await handle.db
      .select({ id: inspections.id, status: inspections.status })
      .from(inspections)
    const line =
      'The public parcel page lists this inspection with its number, type, status and dates.'
    const seen = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.status)) continue
      seen.add(row.status)
      const body = await html(InspectionPage({ params: Promise.resolve({ inspectionId: row.id }) }))
      const listed = ['scheduled', 'passed', 'failed'].includes(row.status)
      expect(body.includes(line)).toBe(listed)
    }
    expect(seen.has('scheduled')).toBe(true)
  })
})

describe('results owed', () => {
  let owedId = ''
  let owedNumber = ''
  let owedDate = '' as CivilDate

  beforeAll(async () => {
    const today = await townToday(handle.db, new Date(), signal)
    owedDate = addDays(today, -4)
    const [row] = await handle.db
      .select({ id: inspections.id, applicationId: inspections.applicationId })
      .from(inspections)
      .where(and(eq(inspections.status, 'scheduled'), eq(inspections.inspectorUserId, inspectorId)))
    owedId = row?.id ?? ''
    await handle.db
      .update(inspections)
      .set({ scheduledDate: owedDate })
      .where(eq(inspections.id, owedId))
    const [app] = await handle.db
      .select({ number: applications.number })
      .from(applications)
      .where(eq(applications.id, row?.applicationId ?? ''))
    owedNumber = app?.number ?? ''
  })

  it('puts the count in the board header with a link to the list', async () => {
    await actAs('staff')
    const today = await townToday(handle.db, new Date(), signal)
    const owed = await handle.db
      .select({ id: inspections.id })
      .from(inspections)
      .where(and(eq(inspections.status, 'scheduled'), lt(inspections.scheduledDate, today)))
    const body = await html(InspectionsPage({ searchParams: Promise.resolve({}) }))
    const header = body.slice(body.indexOf('<header'), body.indexOf('</header>'))
    expect(owed.length).toBeGreaterThan(0)
    expect(header).toContain(
      `Results owed</dt><dd class="text-ink"><a href="/staff/inspections/owed">${owed.length}</a>`,
    )
  })

  it('says what the board lists in its lead line', async () => {
    await actAs('staff')
    const body = await html(InspectionsPage({ searchParams: Promise.resolve({}) }))
    expect(body).toContain('then the inspections booked for today or later.')
    expect(body).not.toContain('already booked')
  })

  it('lists owed results across all inspectors with the days late and a link to record each', async () => {
    await actAs('staff')
    const body = await html(OwedPage())
    expect(body).toContain('<h1>Results owed</h1>')
    expect(body).toContain('Ira Inspector')
    expect(body).toContain(formatCivilDate(owedDate))
    expect(body).toContain('4 days late')
    expect(body).toContain(owedNumber)
    expect(body).toContain(`href="/staff/inspections/${owedId}"`)
    expect(body).toContain('Record result')
  })

  it('refuses someone who may not schedule inspections', async () => {
    await actAs('admin')
    expect(await html(OwedPage())).toContain('You do not have permission to see results owed.')
  })
})
