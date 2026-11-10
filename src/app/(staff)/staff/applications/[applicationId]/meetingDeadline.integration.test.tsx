import { and, asc, eq, gte } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { acceptanceSchedules, applications, boardMeetings, clocks } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { setAcceptanceMeeting } from '@/features/boards/acceptance'
import { seedDemo } from '@/features/demo/seedDemo'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { formatCivilDate } from '@/lib/formatDate'
import { boardIdSql } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps, useDemoStoryClock } from '@/test/demoSeedDeps'
import { filledButtons, sectionOf } from '@/test/htmlSections'
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

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const TODAY = '2026-11-06'
const signal = new AbortController().signal
let handle: TestDb
let clerk: Actor
const ids = new Map<string, string>()

async function page(number: string, on: string = TODAY): Promise<string> {
  state.actor = clerk
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${on}T16:00:00Z`))
  return renderToStaticMarkup(
    (await ApplicationPage({
      params: Promise.resolve({ applicationId: ids.get(number) ?? '' }),
    })) as never,
  )
}

async function clockDue(number: string, ruleKey: string): Promise<string> {
  const [row] = await handle.db
    .select({ due: clocks.currentDue })
    .from(clocks)
    .where(and(eq(clocks.applicationId, ids.get(number) ?? ''), eq(clocks.ruleKey, ruleKey)))
  return row?.due ?? ''
}

async function meetingSet(number: string): Promise<string> {
  const [row] = await handle.db
    .select({ date: boardMeetings.meetingDate })
    .from(acceptanceSchedules)
    .innerJoin(boardMeetings, eq(boardMeetings.id, acceptanceSchedules.meetingId))
    .where(eq(acceptanceSchedules.applicationId, ids.get(number) ?? ''))
  return row?.date ?? ''
}

async function upcoming(board: 'planning_board' | 'zba', from: string = TODAY) {
  return await handle.db
    .select({ id: boardMeetings.id, date: boardMeetings.meetingDate, kind: boardMeetings.kind })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.boardId, boardIdSql(board)),
        eq(boardMeetings.status, 'scheduled'),
        gte(boardMeetings.meetingDate, from),
      ),
    )
    .orderBy(asc(boardMeetings.meetingDate))
}

function optionsOf(html: string): { value: string; text: string; selected: boolean }[] {
  return [...html.matchAll(/<option[^>]*?value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map((m) => ({
    value: m[1] ?? '',
    selected: (m[2] ?? '').includes('selected'),
    text: m[3] ?? '',
  }))
}

function optionText(m: { date: string; kind: string }, due: string): string {
  const mark = m.date <= due ? 'meets the deadline' : 'after the deadline'
  return `${formatCivilDate(m.date)}, ${m.kind} meeting · ${mark}`
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, 'staff@alderpond.example'),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error('no clerk')
  clerk = actor
  for (const row of await handle.db.select().from(applications)) ids.set(row.number, row.id)
})
afterEach(() => {
  useDemoStoryClock()
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

const EARLIER = '2026-11-02'

function noticeLeadDays(): number {
  const rule = ruleByKey(loadPack(), 'nh.pb.notice.mail')
  return rule.kind === 'clock' && 'value' in rule.length ? rule.length.value : 0
}

function siteOption(m: { date: string; kind: string }, due: string, today: string): string {
  const soon = m.date < addDays(today as CivilDate, noticeLeadDays())
  const mark = soon
    ? 'too soon to mail notice'
    : m.date <= due
      ? 'meets the deadline'
      : 'after the deadline'
  return `${formatCivilDate(m.date)}, ${m.kind} meeting · ${mark}`
}

describe('a site plan whose acceptance meeting falls after the completeness deadline, on the demo day', () => {
  it('warns that no meeting on or before the seeded due date can still be noticed, and keeps the vote as the step', async () => {
    const due = await clockDue('SPR-2026-0001', 'nh.pb.completeness')
    const set = await meetingSet('SPR-2026-0001')
    expect(set > due).toBe(true)
    const html = await page('SPR-2026-0001')
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain(`Vote on completeness at the meeting on ${formatCivilDate(set)}`)
    expect(card).toContain(
      `The meeting set, ${formatCivilDate(set)}, is after this deadline: Planning Board completeness determination, ${formatCivilDate(due)}. There is not enough time left to mail notice for any meeting on or before it.`,
    )
    expect(card).not.toContain('name="meetingId"')
    expect(filledButtons(html)).toEqual([])
  })

  it('marks a meeting too soon to notice in the board panel picker and the hearing scheduler', async () => {
    const due = await clockDue('SPR-2026-0001', 'nh.pb.completeness')
    const meetings = await upcoming('planning_board')
    const html = await page('SPR-2026-0001')
    const board = sectionOf(html, 'Acceptance') ?? ''
    expect(
      optionsOf(board)
        .filter((o) => o.value !== '')
        .map((o) => o.text),
    ).toEqual(meetings.map((m) => siteOption(m, due, TODAY)))
    expect(board).toContain('This meeting is after the deadline.')
    const scheduler = sectionOf(html, 'Hearings and decisions') ?? ''
    expect(
      optionsOf(scheduler)
        .filter((o) => /^[0-9a-f-]{36}$/.test(o.value))
        .map((o) => o.text),
    ).toEqual(meetings.map((m) => siteOption(m, due, TODAY).replace(`, ${m.kind} meeting`, '')))
  })
})

describe('the same site plan while a meeting before the deadline can still be noticed', () => {
  it('hosts the move in the card as the one filled button, choosing that meeting', async () => {
    const due = await clockDue('SPR-2026-0001', 'nh.pb.completeness')
    const meetings = await upcoming('planning_board', EARLIER)
    const target = meetings
      .filter((m) => m.date <= due && m.date >= addDays(EARLIER as CivilDate, noticeLeadDays()))
      .at(-1)
    expect(target).toBeDefined()
    const html = await page('SPR-2026-0001', EARLIER)
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain('Move the acceptance meeting')
    expect(filledButtons(html)).toEqual(['Move the meeting'])
    expect(card.match(/name="meetingId"/g)).toHaveLength(1)
    expect(sectionOf(html, 'Board') ?? '').not.toContain('name="meetingId"')
    const options = optionsOf(card).filter((o) => o.value !== '')
    expect(options.map((o) => o.text)).toEqual(meetings.map((m) => siteOption(m, due, EARLIER)))
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual([target?.id])
    expect(card).toContain('This meeting meets the deadline.')
    expect(html).toMatch(
      /data-slot="status-sentence"[^>]*>Waiting on: Town\. Move the acceptance meeting\./,
    )
  })
})

describe('a variance whose hearing meeting meets its deadline but whose abutter list is a draft', () => {
  it('marks the hearing meetings against the seeded hearing deadline and raises no warning', async () => {
    const due = await clockDue('VAR-2026-0001', 'nh.zba.hearing')
    const meetings = await upcoming('zba')
    const html = await page('VAR-2026-0001')
    expect(html).not.toContain('is after this deadline')
    const board = sectionOf(html, 'Hearing') ?? ''
    expect(
      optionsOf(board)
        .filter((o) => o.value !== '')
        .map((o) => o.text),
    ).toEqual(meetings.map((m) => optionText(m, due)))
  })

  it('shows the hearing date once, in the board panel, and the hearings panel does not contradict it', async () => {
    const set = formatCivilDate(await meetingSet('VAR-2026-0001'))
    const html = await page('VAR-2026-0001')
    const outsideOptions = html.replace(/<option[\s\S]*?<\/option>/g, '')
    expect(outsideOptions.split(set)).toHaveLength(2)
    expect(sectionOf(html, 'Hearing') ?? '').toContain(`Hearing meeting: ${set}.`)
    expect(html).not.toContain('No hearing is scheduled yet.')
  })

  it('asks for the abutter list and offers no way to open the hearing while it is a draft', async () => {
    const html = await page('VAR-2026-0001')
    expect(sectionOf(html, 'Do this now') ?? '').toContain('Issue the abutter list')
    const requirements = sectionOf(html, 'Requirements') ?? ''
    expect(requirements).toMatch(/Not done: <\/span><a href="#board"[^>]*>Abutter list issued/)
    expect(html).not.toMatch(/>Open the hearing<\/summary>/)
    expect(html).not.toContain('name="outcome"')
  })
})

describe('the variance after its hearing meeting, with the abutter list still a draft', () => {
  it('still lets the clerk record that the board did not accept it, but not open the hearing', async () => {
    const day = await meetingSet('VAR-2026-0001')
    const html = await page(
      'VAR-2026-0001',
      `${day.slice(0, 8)}${String(Number(day.slice(8)) + 1).padStart(2, '0')}`,
    )
    const board = sectionOf(html, 'Hearing') ?? ''
    expect(board).toContain('Record that the board did not accept it')
    expect(board).toContain('name="outcome" value="not_accepted"')
    expect(html).not.toContain('value="accepted"')
    expect(html).not.toMatch(/>Open the hearing<\/summary>/)
  })
})

describe('moving the site plan meeting to one that meets the deadline', () => {
  it('is accepted by the board domain and clears the warning', async () => {
    const due = await clockDue('SPR-2026-0001', 'nh.pb.completeness')
    const target = (await upcoming('planning_board')).filter((m) => m.date <= due).at(-1)
    const moved = await setAcceptanceMeeting(
      handle.db,
      clerk,
      { applicationId: ids.get('SPR-2026-0001') ?? '', meetingId: target?.id ?? '' },
      signal,
    )
    expect(moved.ok).toBe(true)
    const html = await page('SPR-2026-0001')
    expect(html).not.toContain('is after this deadline')
    expect(sectionOf(html, 'Do this now') ?? '').toContain(
      `Vote on completeness at the meeting on ${formatCivilDate(target?.date ?? '')}`,
    )
  })
})
