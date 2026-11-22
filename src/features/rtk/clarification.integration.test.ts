import { and, eq } from 'drizzle-orm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestRail } from '@/app/(staff)/staff/records/requests/[requestId]/RequestRail'
import { ResponseSection } from '@/app/(staff)/staff/records/requests/[requestId]/ResponseSection'
import { auditLog, rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { recordClarificationAnswer } from '@/features/rtk/clarification'
import { closeRequest, logRequest, rtkRequestView } from '@/features/rtk/requests'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import { recordFirstResponse } from '@/features/rtk/responses'
import type { RequestWorkPlan } from '@/features/rtk/workPlanTypes'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { ACKNOWLEDGING_PACK } from '@/test/packs/acknowledgingPack'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/app/(staff)/staff/records/requests/actions', () => ({
  closeRequestAction: vi.fn(),
  clarificationAnswerAction: vi.fn(),
}))

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let custodian: Actor

beforeEach(async () => {
  setActivePackForTest(ACKNOWLEDGING_PACK)
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
  setActivePackForTest(null)
})

async function acknowledged(clarification?: string): Promise<string> {
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'email',
      requesterName: 'Tamsin Okafor',
      description: 'Everything about the Fernhollow pond dam',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error(logged.error)
  const r = await recordFirstResponse(
    handle.db,
    store,
    custodian,
    {
      requestId: logged.value.requestId,
      kind: 'acknowledged',
      respondedOn: d('2027-07-07'),
      ...(clarification === undefined ? {} : { clarification }),
    },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(r.error)
  return logged.value.requestId
}

const QUESTION = 'Which years of dam inspection reports do you want?'

const rowOf = async (requestId: string) =>
  (await handle.db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId)))[0]

const answer = async (requestId: string, answeredOn: string, expectedRowVersion?: number) =>
  await recordClarificationAnswer(
    handle.db,
    custodian,
    {
      requestId,
      answer: 'Only the 2025 and 2026 reports.',
      answeredOn: d(answeredOn),
      expectedRowVersion: expectedRowVersion ?? (await rowOf(requestId))?.rowVersion ?? 0,
    },
    signal,
    NOW,
  )

async function publishContact(contact: { phone: string; email: string }): Promise<void> {
  const admin = await staffActor(handle.db, 'admin')
  const published = await publishTownProfileSection(
    handle.db,
    admin,
    {
      section: 'profile',
      slice: {
        officeName: 'Town Office',
        addressLines: ['2 Mill Street', 'Fernhollow'],
        website: '',
        officeHours: '',
        logo: null,
        ...contact,
      },
    },
    signal,
  )
  if (!published.ok) throw new Error(JSON.stringify(published.error))
}

async function pageText(requestId: string): Promise<string> {
  const today = d('2027-07-14')
  const view = await rtkRequestView(handle.db, custodian, requestId, today, signal)
  if (!view.ok) throw new Error(view.error)
  const plan = { now: null, due: null } as unknown as RequestWorkPlan
  const html = renderToStaticMarkup(
    createElement('div', null, [
      createElement(ResponseSection, { key: 'response', request: view.value }),
      createElement(RequestRail, {
        key: 'rail',
        data: { request: view.value, plan, today, canManage: true },
      }),
    ]),
  )
  return html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')
}

const letterOf = async (requestId: string) =>
  await pdfWording(await buildResponseLetter(handle.db, requestId, signal, { now: NOW }))

describe('recording the requester answer to a clarifying question', () => {
  it('stores the answer and its date, audits it and leaves the due dates alone', async () => {
    const requestId = await acknowledged(QUESTION)
    const before = await rowOf(requestId)
    expect(await answer(requestId, '2027-07-10')).toEqual({ ok: true, value: undefined })
    const after = await rowOf(requestId)
    expect(after?.clarificationAnswer).toBe('Only the 2025 and 2026 reports.')
    expect(after?.clarificationAnsweredOn).toBe('2027-07-10')
    expect(after?.responseDue).toEqual(before?.responseDue)
    expect(after?.openDueOn).toBe(before?.openDueOn)
    expect(after?.statedDue).toEqual(before?.statedDue)
    expect(after?.status).toBe(before?.status)
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, requestId), eq(auditLog.action, 'rtk.clarification_answered')),
      )
    expect(audits).toHaveLength(1)
  })

  it('refuses an answer dated before the acknowledgement', async () => {
    const requestId = await acknowledged(QUESTION)
    expect(await answer(requestId, '2027-07-06')).toEqual({
      ok: false,
      error: 'before_acknowledgement',
    })
    expect((await rowOf(requestId))?.clarificationAnswer).toBeNull()
  })

  it('refuses an answer dated after today', async () => {
    const requestId = await acknowledged(QUESTION)
    expect(await answer(requestId, '2027-07-15')).toEqual({ ok: false, error: 'future_date' })
  })

  it('refuses an answer when the town asked no question', async () => {
    const requestId = await acknowledged()
    expect(await answer(requestId, '2027-07-10')).toEqual({
      ok: false,
      error: 'no_clarification_question',
    })
  })

  it('refuses an answer on a request opened in an older version', async () => {
    const requestId = await acknowledged(QUESTION)
    const stale = ((await rowOf(requestId))?.rowVersion ?? 0) - 1
    expect(await answer(requestId, '2027-07-10', stale)).toEqual({
      ok: false,
      error: 'stale_version',
    })
    expect((await rowOf(requestId))?.clarificationAnswer).toBeNull()
  })

  it.each(['closed', 'withdrawn'] as const)('refuses an answer on a %s request', async (to) => {
    const requestId = await acknowledged(QUESTION)
    const closed = await closeRequest(
      handle.db,
      custodian,
      { requestId, to, expectedRowVersion: (await rowOf(requestId))?.rowVersion ?? 0 },
      signal,
      NOW,
    )
    if (!closed.ok) throw new Error(closed.error)
    expect(await answer(requestId, '2027-07-10')).toEqual({ ok: false, error: 'already_closed' })
    expect((await rowOf(requestId))?.clarificationAnswer).toBeNull()
  })

  it('refuses a staff member who cannot manage requests', async () => {
    const requestId = await acknowledged(QUESTION)
    const inspector = await staffActor(handle.db, 'inspector')
    const refused = await recordClarificationAnswer(
      handle.db,
      inspector,
      { requestId, answer: 'Only 2026.', answeredOn: d('2027-07-10'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('the request page around the answer', () => {
  it('offers the answer form while the question is open', async () => {
    const text = await pageText(await acknowledged(QUESTION))
    expect(text).toContain('Record the requester answer')
    expect(text).not.toContain('Requester answered')
  })

  it('shows the answer and its date once recorded, and no longer offers the form', async () => {
    const requestId = await acknowledged(QUESTION)
    await answer(requestId, '2027-07-10')
    const text = await pageText(requestId)
    expect(text).toContain('|Requester answered|July 10, 2027|')
    expect(text).toContain('Requester answered, July 10, 2027: Only the 2025 and 2026 reports.')
    expect(text).not.toContain('Record the requester answer')
  })
})

describe('how the letter tells the requester to answer', () => {
  it('names the town office email and phone under the question', async () => {
    await publishContact({ phone: '207-555-0142', email: 'office@fernhollow.example' })
    const wording = await letterOf(await acknowledged(QUESTION))
    expect(wording).toContain(QUESTION)
    expect(wording).toContain('Answer the town at office@fernhollow.example or 207-555-0142.')
  })

  it('names only the part of the contact the town has', async () => {
    await publishContact({ phone: '', email: 'office@fernhollow.example' })
    const wording = await letterOf(await acknowledged(QUESTION))
    expect(wording).toContain('Answer the town at office@fernhollow.example.')
  })

  it('leaves the line out when the town has no contact on file', async () => {
    const wording = await letterOf(await acknowledged(QUESTION))
    expect(wording).toContain(QUESTION)
    expect(wording).not.toContain('Answer the town at')
  })
})
