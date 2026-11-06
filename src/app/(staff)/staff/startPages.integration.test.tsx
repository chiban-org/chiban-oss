import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { inspections, users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { visibleText } from '@/test/leaks'
import { addDays } from '@/types/civilDate'

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

const { default: StaffHome } = await import('@/app/(staff)/staff/page')

const signal = new AbortController().signal
let handle: TestDb

async function homeOf(local: string): Promise<string> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
  return renderToStaticMarkup(await StaffHome())
}

async function homeWithRoles(roles: Role[]): Promise<string> {
  state.actor = await loadActor(handle.db, await makeUser(handle.db, { roles }), signal)
  return renderToStaticMarkup(await StaffHome())
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1] ?? '')
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  await owePastResult()
})

async function owePastResult(): Promise<void> {
  const [inspector] = await handle.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'inspector@alderpond.example'))
  const [model] = await handle.db.select().from(inspections).limit(1)
  if (inspector === undefined || model === undefined) throw new Error('demo inspector missing')
  const today = await townToday(handle.db, new Date(), signal)
  await handle.db.insert(inspections).values({
    applicationId: model.applicationId,
    checklistVersionId: model.checklistVersionId,
    inspectionType: model.inspectionType,
    isFinal: model.isFinal,
    channel: 'phone',
    contactName: 'Pat Contractor',
    status: 'scheduled',
    inspectorUserId: inspector.id,
    scheduledDate: addDays(today, -2),
    startMinute: 1,
    durationMinutes: 30,
  })
}
afterAll(async () => {
  await handle.drop()
})

describe('the staff start page for each role', () => {
  it('shows a clerk what is waiting, the next deadlines and a way to the counter', async () => {
    const html = await homeOf('staff')
    expect(new Set(headings(html))).toEqual(
      new Set([
        'Applications',
        'Enforcement',
        'Payments',
        'Records',
        'Board packets',
        'Inspections',
      ]),
    )
    expect(html).toContain('Next deadlines')
    expect(html).toContain('href="/staff/counter"')
    expect(html).not.toContain('Waiting on fees')
  })

  it('shows an inspector the results still owed, today, requests and their cases, not the clerk queue', async () => {
    const html = await homeOf('inspector')
    const text = visibleText(html)
    expect(new Set(headings(html))).toEqual(new Set(['Inspections', 'Enforcement']))
    expect(text).toContain('Still need a result')
    expect(html).toContain('href="/staff/inspections/day#missing-results"')
    expect(text).toContain('Next inspection days')
    expect(text).not.toContain('Submitted, not yet under review')
  })

  it('shows finance payment problems, fees, receipts and the cash report for today', async () => {
    const html = await homeOf('finance')
    const today = await townToday(handle.db, new Date(), signal)
    expect(headings(html)).toEqual(['Payments'])
    expect(html).toContain(`href="/staff/reports/cash-receipts?date=${today}"`)
    expect(html).not.toContain('Next deadlines')
  })

  it('shows the records custodian requests, preservation, disposition, holds and exports', async () => {
    const html = await homeOf('records')
    expect(headings(html)).toEqual(['Records'])
    expect(html).toContain('href="/staff/records/requests"')
    expect(html).not.toContain('Next deadlines')
  })

  it('shows admin the state of the system instead of the application queue', async () => {
    const text = visibleText(await homeOf('admin'))
    expect(text).toContain('System')
    expect(text).toContain('Health checks needing attention')
    expect(text).not.toContain('Submitted, not yet under review')
    expect(text).not.toContain('Next deadlines')
  })

  it('keeps reviewers on their reviews and sends board members to the board page', async () => {
    await expect(homeOf('reviewer')).rejects.toThrow('NEXT_REDIRECT:/staff/reviews')
    await expect(homeOf('board')).rejects.toThrow('NEXT_REDIRECT:/board')
  })

  it('shows each role a person holds, and the board for a clerk on a board', async () => {
    expect(new Set(headings(await homeWithRoles(['finance', 'inspector'])))).toEqual(
      new Set(['Payments', 'Inspections', 'Enforcement']),
    )
    const clerkOnBoard = await homeWithRoles(['staff', 'board_member', 'reviewer'])
    expect(new Set(headings(clerkOnBoard))).toEqual(
      new Set([
        'Applications',
        'Board meetings',
        'Reviews',
        'Enforcement',
        'Payments',
        'Records',
        'Board packets',
        'Inspections',
      ]),
    )
  })

  it('never prints a zero count', async () => {
    for (const who of ['staff', 'inspector', 'finance', 'records', 'admin']) {
      expect(await homeOf(who)).not.toMatch(/tabular-nums[^"]*">0<\/span>/)
    }
  })
})
