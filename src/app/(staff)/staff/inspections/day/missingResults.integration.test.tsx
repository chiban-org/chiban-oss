import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { weekdayName } from '@/features/inspections/slotWeeks'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'
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

const { default: DayPage } = await import('@/app/(staff)/staff/inspections/day/page')

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld
let missingId = ''
let missingDate = '' as CivilDate

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  w = await setupInspectionWorld(handle.db)
  const today = await townToday(handle.db, new Date(), signal)
  missingDate = addDays(today, -3)
  missingId = await insertInspection(handle.db, w.trade.applicationId, 'rough', {
    inspectorUserId: w.inspector.userId,
    scheduledDate: missingDate,
    startMinute: 600,
    durationMinutes: 30,
    status: 'scheduled',
  })
})
afterAll(async () => {
  await handle.drop()
})

async function dayHtml(params: { date?: string } = {}): Promise<string> {
  return renderToStaticMarkup((await DayPage({ searchParams: Promise.resolve(params) })) as never)
}

describe('My day', () => {
  it('lists past inspections that still need a result, linked to each inspection', async () => {
    state.actor = w.inspector
    const html = await dayHtml()
    expect(html).toContain('id="missing-results"')
    expect(html).toContain('Still need a result')
    expect(html).toContain(`href="/staff/inspections/${missingId}"`)
    expect(html).toContain(formatCivilDate(missingDate))
    expect(html).toContain(w.trade.number)
  })

  it('leaves the panel out when nothing is waiting for a result', async () => {
    state.actor = w.otherInspector
    expect(await dayHtml()).not.toContain('Still need a result')
  })

  it('puts the heading with the weekday before the owed results', async () => {
    state.actor = w.inspector
    const html = await dayHtml()
    expect(html.indexOf('<h1')).toBeGreaterThan(-1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('Still need a result'))
    const today = await townToday(handle.db, new Date(), signal)
    expect(html).toContain(`${weekdayName(today)}, ${formatCivilDate(today)}`)
  })

  it('calls the owed stop Result owed, offers Record result and labels the permit link', async () => {
    state.actor = w.inspector
    const html = await dayHtml({ date: missingDate })
    expect(html).toContain('Result owed')
    expect(html).not.toContain('>Scheduled<')
    expect(html).toMatch(new RegExp(`href="/staff/inspections/${missingId}"[^>]*>Record result`))
    expect(html).toContain(`href="/staff/applications/${w.trade.applicationId}"`)
    expect(html).toContain(`Permit ${w.trade.number}`)
    expect(html).not.toContain(`>Open ${w.trade.number}`)
  })

  it('shows a clerk the inspector picker', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const html = await dayHtml()
    expect(html).toContain('Inspector day lists')
  })
})
