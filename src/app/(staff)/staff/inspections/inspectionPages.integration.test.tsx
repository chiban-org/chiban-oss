import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
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
import { filledButtons, filledLinks, railOf, sectionOf } from '@/test/htmlSections'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'

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
    expect(chosen).toContain('aria-label="Inspectors"')
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

async function seeded(type: string, status: string, reinspection = false) {
  const [row] = await handle.db
    .select({
      id: inspections.id,
      applicationId: inspections.applicationId,
      number: applications.number,
      scheduledDate: inspections.scheduledDate,
      inspectorUserId: inspections.inspectorUserId,
    })
    .from(inspections)
    .innerJoin(applications, eq(applications.id, inspections.applicationId))
    .where(
      and(
        eq(inspections.inspectionType, type),
        eq(inspections.status, status as 'scheduled'),
        reinspection ? isNotNull(inspections.reinspectionOf) : isNull(inspections.reinspectionOf),
      ),
    )
  if (row === undefined) throw new Error(`no seeded ${status} ${type}`)
  return row
}

async function page(id: string): Promise<string> {
  return await html(InspectionPage({ params: Promise.resolve({ inspectionId: id }) }))
}

function sentence(body: string): string {
  return /data-slot="status-sentence"[^>]*>([^<]*)</.exec(body)?.[1] ?? ''
}

describe('the inspection record page', () => {
  it('asks the town to schedule a request, with the preferred day and channel in the rail', async () => {
    await actAs('staff')
    const insulation = await seeded('insulation', 'requested')
    const body = await page(insulation.id)
    expect(sentence(body)).toBe('Waiting on: Town. Schedule the Insulation inspection.')
    const card = sectionOf(body, 'Do this now') ?? ''
    expect(card).toContain('Schedule the Insulation inspection')
    expect(card).toContain('The requester prefers ')
    expect(card).toContain(`href="/staff/inspections?request=${insulation.id}"`)
    expect(filledLinks(body)).toEqual(['Schedule it'])
    expect(filledButtons(body)).toEqual([])
    expect(body).not.toContain('aria-label="Result"')
    expect(body).not.toContain('aria-label="Checklist"')
    expect(body).not.toContain('Not answered')
    const rail = railOf(body)
    expect(rail).toContain('Preferred day')
    expect(rail).toContain('Online')
    expect(rail).toContain('Cancel this inspection')
    expect(body).toContain('aria-current="step"')
  })

  it('shows a clerk who records the scheduled final, read-only, with reschedule and cancel', async () => {
    await actAs('staff')
    const final = await seeded('final', 'scheduled')
    const body = await page(final.id)
    const card = sectionOf(body, 'Do this now') ?? ''
    expect(card).toContain('Waiting on Ira Inspector')
    expect(body).not.toContain('role="radiogroup"')
    expect(body).not.toContain('Record result')
    expect(sectionOf(body, 'Checklist') ?? '').toContain('What the inspector checks on site.')
    const rail = railOf(body)
    expect(rail).toContain('Ira Inspector')
    expect(rail).toContain(`href="/staff/inspections?request=${final.id}"`)
    expect(rail).toContain('Reschedule')
    expect(rail).toContain('Cancel this inspection')
  })

  it('gives the assigned inspector the checklist, the owed line and the closing sentence', async () => {
    await actAs('inspector')
    const final = await seeded('final', 'scheduled')
    const today = await townToday(handle.db, new Date(), signal)
    const date = final.scheduledDate as CivilDate
    const late = daysBetween(date, today)
    const body = await page(final.id)
    const card = sectionOf(body, 'Do this now') ?? ''
    expect(card).toContain('Record the result')
    expect(card).toContain('Notes for the permit holder')
    expect(card).toContain(`Passing this final closes permit ${final.number}.`)
    expect(filledButtons(body)).toEqual(['Record result'])
    const owed = `Result owed since ${formatCivilDate(date)} (${late} ${late === 1 ? 'day' : 'days'} late)`
    expect(body.split(owed)).toHaveLength(2)
    expect(body).toContain('Add a photo')
  })

  it('lets the building official record an inspection assigned to someone else', async () => {
    await actAs('official')
    const final = await seeded('final', 'scheduled')
    const card = sectionOf(await page(final.id), 'Do this now') ?? ''
    expect(card).toContain('Notes for the permit holder')
  })

  it('points a failed inspection to its reinspection and lists the result', async () => {
    await actAs('staff')
    const failed = await seeded('framing', 'failed')
    const again = await seeded('framing', 'scheduled', true)
    const body = await page(failed.id)
    expect(sentence(body)).toMatch(/^Failed on .+\. The reinspection is scheduled\.$/)
    const card = sectionOf(body, 'Do this now') ?? ''
    expect(card).toContain('Reinspection scheduled')
    expect(card).toContain(`href="/staff/inspections/${again.id}"`)
    const result = sectionOf(body, 'Result') ?? ''
    expect(result).toContain(': Fail')
    expect(result).toContain('Fire blocking is missing at the stair opening.')
  })

  it('notes the reinspection in the strip and links the failure it follows', async () => {
    await actAs('staff')
    const failed = await seeded('framing', 'failed')
    const again = await seeded('framing', 'scheduled', true)
    const body = await page(again.id)
    expect(body).toContain('Framing reinspection')
    expect(body).toContain('Reinspection requested')
    expect(railOf(body)).toContain(`href="/staff/inspections/${failed.id}"`)
  })

  it('reads only the outcome of a passed inspection', async () => {
    await actAs('staff')
    const rough = await seeded('rough', 'passed')
    const body = await page(rough.id)
    expect(sentence(body)).toMatch(/^Passed on [A-Z][a-z]+ \d{1,2}, \d{4}\.$/)
    expect(sectionOf(body, 'Do this now') ?? '').toContain('Recorded by Ira Inspector on ')
    expect(railOf(body)).not.toContain('Cancel this inspection')
  })

  it('says why, by whom and when a cancelled inspection was cancelled, with no checklist', async () => {
    await actAs('staff')
    const footing = await seeded('footing', 'cancelled')
    const body = await page(footing.id)
    expect(sentence(body)).toMatch(/^Cancelled on .+\.$/)
    const card = sectionOf(body, 'Do this now') ?? ''
    expect(card).toContain('The permit was suspended')
    expect(card).toContain('Automatically')
    expect(body).not.toContain('aria-label="Result"')
    expect(body).not.toContain('aria-label="Checklist"')
    expect(body).not.toContain('Not answered')
    expect(railOf(body)).not.toContain('Cancel this inspection')
  })

  it('hides the checklist with the reason while the permit is suspended', async () => {
    await actAs('inspector')
    const final = await seeded('final', 'scheduled')
    await handle.db
      .update(applications)
      .set({ state: 'suspended' })
      .where(eq(applications.id, final.applicationId))
    try {
      const body = await page(final.id)
      expect(sentence(body)).toBe('Inspections are paused while this permit is under appeal.')
      expect(sectionOf(body, 'Do this now') ?? '').toContain('Wait for the appeal to be decided')
      expect(body).not.toContain('role="radiogroup"')
    } finally {
      await handle.db
        .update(applications)
        .set({ state: 'issued' })
        .where(eq(applications.id, final.applicationId))
    }
  })
})
