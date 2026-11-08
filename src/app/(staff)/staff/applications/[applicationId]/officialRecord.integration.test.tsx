import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, inspections } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { countSections, filledButtons, filledLinks, sectionOf } from '@/test/htmlSections'

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

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
const SEEDED_NUMBER = 'BP-2025-0001'
let handle: TestDb
let official: Actor
const actors = new Map<string, Actor>()
const pages = new Map<string, string>()
let ids = new Map<string, string>()
let officialNumber = ''
let officialDate = ''
let officialInspectionId = ''

async function actorFor(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function pageAs(role: string, number: string): Promise<string> {
  const key = `${role} ${number}`
  const cached = pages.get(key)
  if (cached !== undefined) return cached
  state.actor = actors.get(role)
  const html = renderToStaticMarkup(
    (await ApplicationPage({
      params: Promise.resolve({ applicationId: ids.get(number) ?? '' }),
    })) as never,
  )
  pages.set(key, html)
  return html
}

function statusSentence(html: string): string {
  const match = html.match(/data-slot="status-sentence"[^>]*>([^<]*)</)
  return match?.[1]?.replaceAll('&#x27;', "'") ?? ''
}

function occurrences(html: string, text: string): number {
  return html.split(text).length - 1
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, await demoSeedDeps())
  for (const local of ['staff', 'inspector', 'official']) actors.set(local, await actorFor(local))
  official = actors.get('official') as Actor
  const rows = await handle.db.select().from(applications)
  ids = new Map(rows.map((r) => [r.number, r.id]))
  const [mine] = await handle.db
    .select({
      id: inspections.id,
      number: applications.number,
      date: inspections.scheduledDate,
    })
    .from(inspections)
    .innerJoin(applications, eq(applications.id, inspections.applicationId))
    .where(eq(inspections.inspectorUserId, official.userId))
  officialNumber = mine?.number ?? ''
  officialDate = mine?.date ?? ''
  officialInspectionId = mine?.id ?? ''
  actors.set('staff', await actorFor('staff'))
})
afterAll(async () => {
  await handle.drop()
})

describe('the building official on an issued permit with an inspection due', () => {
  it('seeds the inspection owed in the past so the card has a result to record', async () => {
    const today = await townToday(handle.db, new Date(), signal)
    expect(officialNumber).not.toBe('')
    expect(officialDate < today).toBe(true)
  })

  it('leads Do this now with the inspection and a link to record it on its page as the one filled action', async () => {
    const html = await pageAs('official', officialNumber)
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain('Framing inspection')
    expect(card).toContain(`${formatCivilDate(officialDate)} at 10:30 AM`)
    expect(card).toContain(`href="/staff/inspections/${officialInspectionId}"`)
    expect(card).not.toContain('Notes for the permit holder')
    expect(card).not.toContain('Issue the certificate of occupancy')
    expect(filledButtons(html)).toEqual([])
    expect(filledLinks(html)).toEqual(['Record the result'])
  })

  it('says the inspector is waiting, in the inspector words', async () => {
    const html = await pageAs('official', officialNumber)
    expect(statusSentence(html)).toBe(
      `Waiting on: Inspector (you). Framing inspection from ${formatCivilDate(officialDate)} needs its result.`,
    )
  })

  it('records nothing on the permit: the Inspections panel lists the row, links it, and keeps its Cancel', async () => {
    const html = await pageAs('official', officialNumber)
    expect(occurrences(html, 'Notes for the permit holder')).toBe(0)
    expect(occurrences(html, 'Cancel this inspection')).toBe(1)
    const panel = sectionOf(html, 'Inspections') ?? ''
    expect(panel).toContain('Framing inspection')
    expect(panel).toContain(`href="/staff/inspections/${officialInspectionId}"`)
    expect(panel).not.toContain('Record result')
    expect(panel).toContain('Cancel this inspection')
  })

  it('keeps the office page: fees, requirement groups and the certificate under closing', async () => {
    const html = await pageAs('official', officialNumber)
    expect(countSections(html, 'Fees and payments')).toBe(1)
    expect(countSections(html, 'Next inspection')).toBe(0)
    expect(html).not.toContain('data-permit-facts')
    const requirements = sectionOf(html, 'Requirements') ?? ''
    expect(requirements).toContain('Before it can be closed')
    expect(requirements).toContain('No certificate of occupancy has been issued.')
  })

  it('does not take over a permit where the inspection belongs to someone else', async () => {
    const html = await pageAs('official', SEEDED_NUMBER)
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).not.toContain('Framing reinspection')
    expect(card).not.toContain('Record result')
    expect(occurrences(html, 'Notes for the permit holder')).toBe(0)
    expect(countSections(html, 'Next inspection')).toBe(0)
  })
})

describe('the clerk and the inspector keep the views they had', () => {
  it('shows a clerk the same card on the official permit, with no result form', async () => {
    const html = await pageAs('staff', officialNumber)
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).not.toContain('Record result')
    expect(card).not.toContain('Framing inspection')
    expect(occurrences(html, 'Notes for the permit holder')).toBe(0)
    expect(statusSentence(html)).not.toContain('Inspector')
    expect(countSections(html, 'Inspections')).toBe(1)
    expect(sectionOf(html, 'Inspections') ?? '').toContain('Cancel')
  })

  it('shows the inspector the inspector view on the seeded permit', async () => {
    const html = await pageAs('inspector', SEEDED_NUMBER)
    expect(countSections(html, 'Do this now')).toBe(0)
    expect(countSections(html, 'Next inspection')).toBe(1)
    expect(countSections(html, 'Fees and payments')).toBe(0)
    expect(filledButtons(html)).toEqual([])
    expect(filledLinks(html)).toEqual(['Record the result'])
    expect(statusSentence(html)).toMatch(
      /^Waiting on: Inspector \(you\)\. Framing reinspection from /,
    )
  })

  it('shows the inspector the same view on the official permit, not the official card', async () => {
    const html = await pageAs('inspector', officialNumber)
    expect(countSections(html, 'Do this now')).toBe(0)
    expect(countSections(html, 'Next inspection')).toBe(1)
    expect(sectionOf(html, 'Next inspection') ?? '').not.toContain('Notes for the permit holder')
    expect(statusSentence(html)).toContain('Inspector (Dana Booth)')
  })
})
