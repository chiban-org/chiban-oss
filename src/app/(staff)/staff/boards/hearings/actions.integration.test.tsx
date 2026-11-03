import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { boardDecisions, hearings, noticeProofs, regionalImpactParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { fileDecision } from '@/features/decisions/fileDecision'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  type BoardWorld,
  publishRegionalContacts,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { findIsoDates, findRawKeys, findUuids } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import { issueListWithRecipients, proofDocument, recipient } from '@/test/noticeFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

interface MockState {
  db: unknown
  actor: Actor | null
  store: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null, store: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
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
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/server/trpc/context', () => ({
  createContext: () =>
    Promise.resolve({ db: state.db, actor: state.actor, signal: new AbortController().signal }),
}))
vi.mock('@/features/storage/objectStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/storage/objectStore')>()
  return { ...original, getObjectStore: () => state.store }
})

const actions = await import('./actions')
const decisionActions = await import('./decisionActions')
const { default: HearingPage } = await import('./[hearingId]/page')
const { default: MeetingPage } = await import('../meetings/[meetingId]/page')
const { default: DecisionPage } = await import('../decisions/[decisionId]/page')
const { default: MembersPage } = await import('../members/page')
const { default: PublicMeetingsPage } = await import('@/app/(public)/meetings/page')
const { GET: letters } = await import('./[hearingId]/letters/route')

let handle: TestDb
let world: BoardWorld
let store: ObjectStore
let decided: Awaited<ReturnType<typeof decidedZba>>

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15', '2027-04-29'] })
  store = (await makeTestStore()).store
  state.store = store
  decided = await decidedZba(handle.db, world, store, { votedOn: '2027-04-15' })
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string | string[]>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) {
    for (const value of Array.isArray(v) ? v : [v]) f.append(k, value)
  }
  return f
}

async function unnoticedHearing() {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const meeting = (
    await handle.db.query.boardMeetings.findMany({
      where: (m, { eq: equals }) => equals(m.meetingDate, '2027-04-29'),
    })
  )[0]
  state.actor = world.staff
  const result = await actions.scheduleHearingAction(
    form({ applicationId: id, meetingId: meeting?.id ?? '', kind: 'public_hearing' }),
  )
  if (!result.ok) throw new Error(result.error)
  const [row] = await handle.db.select().from(hearings).where(eq(hearings.applicationId, id))
  return { applicationId: id, hearingId: row?.id ?? '' }
}

describe('hearing actions', () => {
  it('mark properly noticed action refuses with a missing item even when called directly', async () => {
    const { hearingId } = await unnoticedHearing()
    state.actor = world.staff
    const result = await actions.markProperlyNoticedAction(form({ hearingId }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not properly noticed')
      expect(result.error).toContain('Missing')
    }
    const [row] = await handle.db.select().from(hearings).where(eq(hearings.id, hearingId))
    expect(row?.properlyNoticedAt).toBeNull()
  })

  it('record proof action without csrf is refused', async () => {
    const { applicationId, hearingId } = await unnoticedHearing()
    state.actor = world.staff
    const [row] = await handle.db.select().from(hearings).where(eq(hearings.id, hearingId))
    const status = await handle.db.query.noticeItems.findMany({
      where: (i, { eq: equals }) => equals(i.setId, row?.noticeSetId ?? ''),
    })
    const before = (await handle.db.select().from(noticeProofs)).length
    const result = await actions.recordProofAction(
      form(
        {
          itemIds: status.map((i) => i.id),
          method: 'certificate_of_mailing',
          effectiveOn: '2027-04-01',
          documentId: await proofDocument(handle.db, world, applicationId),
        },
        null,
      ),
    )
    expect(result.ok).toBe(false)
    expect(await handle.db.select().from(noticeProofs)).toHaveLength(before)
  })

  it('building the agenda of a meeting with no hearings says none are scheduled', async () => {
    state.actor = world.staff
    const [meeting] = await handle.db.query.boardMeetings.findMany({
      where: (m, { and, eq: equals }) =>
        and(equals(m.meetingDate, '2027-03-10'), equals(m.board, 'planning_board')),
    })
    expect(await actions.buildAgendaAction(form({ meetingId: meeting?.id ?? '' }))).toEqual({
      ok: true,
      message:
        'No hearings are scheduled for this meeting. A continued hearing is listed at the meeting it was continued to.',
    })
  })

  it('actions are refused for staff without board.record', async () => {
    const { hearingId } = await unnoticedHearing()
    state.actor = await staffActor(handle.db, 'reviewer')
    expect((await actions.markProperlyNoticedAction(form({ hearingId }))).ok).toBe(false)
    expect((await actions.buildAgendaAction(form({ meetingId: decided.meetingId }))).ok).toBe(false)
    expect(
      (
        await decisionActions.fileDecisionAction(
          form({ decisionId: decided.decisionId, filedOn: '2027-04-20', minutesDocumentId: 'x' }),
        )
      ).ok,
    ).toBe(false)
  })

  it('a malformed continuation is rejected with plain words', async () => {
    const { hearingId } = await unnoticedHearing()
    state.actor = world.staff
    const result = await actions.continueHearingAction(
      form({ hearingId, toMeetingId: decided.meetingId, announced: 'yes', details: '' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error).toBe(
        'Enter the date, time, and place that were announced at the meeting.',
      )
  })
})

describe('decision actions', () => {
  it('recording a decision with the member votes as text works end to end', async () => {
    const held = await decidedZba(handle.db, world, store, {
      votedOn: '2027-04-15',
      documents: false,
    })
    expect(held.decisionId).not.toBe('')
    const [row] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, held.decisionId))
    expect(row?.votes.for).toBe(4)
  })

  it('a decision with no vote lines is invalid', async () => {
    state.actor = world.staff
    const result = await decisionActions.recordDecisionAction(
      form({
        applicationId: decided.applicationId,
        hearingId: decided.hearingId,
        votedOn: '2027-04-15',
        outcome: 'approved',
        votes: '',
      }),
    )
    expect(result.ok).toBe(false)
  })
})

describe('staff and public pages', () => {
  const clean = (html: string) =>
    html
      .replace(/href="[^"]*"/g, '')
      .replace(/value="[^"]*"/g, '')
      .replace(/(min|max)="[^"]*"/g, '')
      .replace(/name="[^"]*"/g, '')

  it('the hearing page shows the checklist and no raw ids, dates, or keys', async () => {
    const { hearingId } = await unnoticedHearing()
    state.actor = world.staff
    const html = clean(
      renderToStaticMarkup(await HearingPage({ params: Promise.resolve({ hearingId }) })),
    )
    expect(html).toContain('Notice checklist')
    expect(html).toContain('Upload a certificate or receipt')
    expect(html).toContain('>Choose an uploaded file</option>')
    expect(html).not.toContain(', snapshot 1')
    expect(html).toContain('Missing')
    expect(html).toContain('3 notices still need proof')
    expect(html).not.toContain('>Mark properly noticed<')
    expect(findUuids(html)).toEqual([])
    expect(findIsoDates(html.replace(/defaultValue|value/g, ''))).toEqual([])
    expect(
      findRawKeys(html, [
        'verified_mail',
        'proved_late',
        'public_hearing',
        'nh.zba.notice_req.mail',
      ]),
    ).toEqual([])
  })

  it('a continued hearing page offers no notice marking', async () => {
    const { hearingId } = await unnoticedHearing()
    await handle.db.update(hearings).set({ status: 'continued' }).where(eq(hearings.id, hearingId))
    state.actor = world.staff
    const html = renderToStaticMarkup(await HearingPage({ params: Promise.resolve({ hearingId }) }))
    expect(html).toContain('Notice checklist')
    expect(html).not.toContain('Mark properly noticed')
    expect(html).not.toContain('still need proof')
  })

  it('the hearing page shows the permission page to a reviewer and is not found for a stranger id', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    const html = renderToStaticMarkup(
      await HearingPage({ params: Promise.resolve({ hearingId: decided.hearingId }) }),
    )
    expect(html).toContain('You do not have permission to work with hearings.')
    state.actor = world.staff
    await expect(
      HearingPage({
        params: Promise.resolve({ hearingId: '00000000-0000-4000-8000-000000000000' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('the meeting page lists hearings and the agenda controls', async () => {
    state.actor = world.staff
    const html = clean(
      renderToStaticMarkup(
        await MeetingPage({ params: Promise.resolve({ meetingId: decided.meetingId }) }),
      ),
    )
    expect(html).toContain('Zoning Board of Adjustment meeting')
    expect(html).toContain('<h1>April 15, 2027</h1>')
    expect(html).toContain('Add the scheduled hearings')
    expect(findUuids(html)).toEqual([])
  })

  it('the decision page shows findings, filing, and the appeal graph in words', async () => {
    state.actor = world.staff
    const html = clean(
      renderToStaticMarkup(
        await DecisionPage({ params: Promise.resolve({ decisionId: decided.decisionId }) }),
      ),
    )
    expect(html).toContain('Approved, voted April 15, 2027')
    expect(html).toContain('Upload the minutes')
    expect(html).not.toContain('Reasons for disapproval')
    expect(html).toContain('>Choose the minutes</option>')
    expect(html).not.toContain(', snapshot 1')
    expect(html).not.toContain('>Variance notice of decision</option>')
    expect(html).toContain('The proposal meets each criterion of the ordinance.')
    expect(html).toContain('Zoning Board decision')
    expect(html).toContain('4 for, 1 against, 0 abstaining')
    expect(findUuids(html)).toEqual([])
    expect(findIsoDates(html)).toEqual([])
    expect(
      findRawKeys(html, ['approved_with_conditions', 'zba_decision', 'rehearing_motion']),
    ).toEqual([])
  })

  it('the decision page shows the transmittal checklist and proof form once it is started', async () => {
    await publishRegionalContacts(handle.db, world)
    const regional = await decidedZba(handle.db, world, store, {
      votedOn: '2027-04-15',
      regional: 'yes',
    })
    await handle.db.insert(regionalImpactParties).values({
      applicationId: regional.applicationId,
      municipalityKey: 'pine_river',
    })
    state.actor = world.staff
    const before = renderToStaticMarkup(
      await DecisionPage({ params: Promise.resolve({ decisionId: regional.decisionId }) }),
    )
    expect(before).not.toContain('Record proof of transmittal')
    const started = await decisionActions.transmittalAction(
      form({ decisionId: regional.decisionId }),
    )
    expect(started.ok).toBe(true)
    const html = renderToStaticMarkup(
      await DecisionPage({ params: Promise.resolve({ decisionId: regional.decisionId }) }),
    )
    expect(html).toContain('Record proof of transmittal')
    expect(html).toContain('by certified mail')
    expect(html).toContain('initial set of plans to the regional planning commission only')
    expect(html).not.toContain('First class mail')
    expect(html).toContain('Alder Valley Regional Planning Commission')
    expect(html).toContain('Town of Pine River')
    expect(html).not.toContain('Mark properly noticed')
  })

  it('the decision page shows the permission page to a reviewer', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    const html = renderToStaticMarkup(
      await DecisionPage({ params: Promise.resolve({ decisionId: decided.decisionId }) }),
    )
    expect(html).toContain('You do not have permission to work with board decisions.')
  })

  it('the members page is for staff with board.manage_members only', async () => {
    state.actor = world.staff
    const noSearch = { searchParams: Promise.resolve({}) }
    const members = renderToStaticMarkup(await MembersPage(noSearch))
    expect(members).toContain('Add a board member')
    expect(members).toMatch(
      /<td[^>]*>Avery Stone<\/td><td>member1@alderpond\.example<\/td><td>Alder Pond Planning Board<\/td><td>Member<\/td>/,
    )
    expect(members.match(/aria-sort=/g)?.length).toBe(1)
    state.actor = await staffActor(handle.db, 'inspector')
    expect(renderToStaticMarkup(await MembersPage(noSearch))).toContain(
      'You do not have permission to manage board members.',
    )
  })

  it('the public page lists only filed decisions and published agendas, with no text under 16px', async () => {
    const html = renderToStaticMarkup(
      await PublicMeetingsPage({ searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('No decisions have been filed yet.')
    expect(html).not.toMatch(/text-(xs|sm)\b/)
    const filed = await fileDecision(
      handle.db,
      world.staff,
      {
        decisionId: decided.decisionId,
        filedOn: '2027-04-16' as CivilDate,
        minutesDocumentId: await proofDocument(handle.db, world, decided.applicationId),
      },
      new AbortController().signal,
      new Date('2027-04-16T16:00:00Z'),
    )
    const page = renderToStaticMarkup(
      await PublicMeetingsPage({ searchParams: Promise.resolve({}) }),
    )
    expect(filed.ok).toBe(true)
    expect(page).toContain('Approved, voted April 15, 2027')
    expect(page).toContain('Notice of Decision')
    expect(findIsoDates(page.replace(/href="[^"]*"/g, ''))).toEqual([])
  })

  it('the second page of agendas links back to newer agendas in 16px text', async () => {
    const html = renderToStaticMarkup(
      await PublicMeetingsPage({ searchParams: Promise.resolve({ agendas: '2' }) }),
    )
    expect(html).toContain('href="/meetings?agendas=1"')
    expect(html).toContain('Newer agendas')
    expect(html).not.toContain('Older agendas')
    expect(html).not.toMatch(/text-(xs|sm)\b/)
  })

  it('the letters route prints for staff and is refused for a reviewer', async () => {
    const { hearingId } = await unnoticedHearing()
    state.actor = world.staff
    const printed = await letters(new Request('http://localhost/x'), {
      params: Promise.resolve({ hearingId }),
    })
    expect(printed.status).toBe(200)
    state.actor = await staffActor(handle.db, 'reviewer')
    const forbidden = await letters(new Request('http://localhost/x'), {
      params: Promise.resolve({ hearingId }),
    })
    expect(forbidden.status).toBe(403)
    const unknown = await letters(new Request('http://localhost/x'), {
      params: Promise.resolve({ hearingId: 'nope' }),
    })
    expect(unknown.status).toBe(404)
  })
})
