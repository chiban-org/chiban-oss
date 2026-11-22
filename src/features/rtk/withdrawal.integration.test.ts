import { and, eq } from 'drizzle-orm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestRail } from '@/app/(staff)/staff/records/requests/[requestId]/RequestRail'
import { auditLog, recordEvents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { closeRequest, logRequest, rtkRequestView } from '@/features/rtk/requests'
import type { RequestWorkPlan } from '@/features/rtk/workPlanTypes'
import { makeTestDb, type TestDb } from '@/test/db'
import { RETENTION_EVENTS_PACK } from '@/test/packs/retentionEventsPack'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/app/(staff)/staff/records/requests/actions', () => ({ closeRequestAction: vi.fn() }))

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const TODAY = '2027-07-14' as CivilDate
const NOTE = 'Phoned the town office and said the records are no longer needed.'
let handle: TestDb
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
  setActivePackForTest(null)
})

async function closed(to: 'closed' | 'withdrawn', withdrawalNote?: string): Promise<string> {
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'phone',
      requesterName: 'Ellis Marchetti',
      description: 'Building permits for 3 Alder Pond Road',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error(logged.error)
  const requestId = logged.value.requestId
  const done = await closeRequest(
    handle.db,
    custodian,
    {
      requestId,
      to,
      expectedRowVersion: 1,
      ...(withdrawalNote === undefined ? {} : { withdrawalNote }),
    },
    signal,
    NOW,
  )
  if (!done.ok) throw new Error(done.error)
  return requestId
}

function d(s: string): CivilDate {
  return s as CivilDate
}

async function railText(requestId: string): Promise<string> {
  const view = await rtkRequestView(handle.db, custodian, requestId, TODAY, signal)
  if (!view.ok) throw new Error(view.error)
  const plan = { now: null, due: null } as unknown as RequestWorkPlan
  const html = renderToStaticMarkup(
    createElement(RequestRail, {
      data: { request: view.value, plan, today: TODAY, canManage: true },
    }),
  )
  return html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')
}

describe('when and how a request was withdrawn', () => {
  it('a withdrawn request shows its date and how the requester withdrew', async () => {
    setActivePackForTest(RETENTION_EVENTS_PACK)
    const requestId = await closed('withdrawn', NOTE)
    const events = await handle.db
      .select()
      .from(recordEvents)
      .where(
        and(eq(recordEvents.rtkRequestId, requestId), eq(recordEvents.kind, 'request_completed')),
      )
    expect(events).toHaveLength(1)
    const view = await rtkRequestView(handle.db, custodian, requestId, TODAY, signal)
    expect(view.ok && view.value.completedOn).toBe('2027-07-14')
    expect(view.ok && view.value.withdrawalNote).toBe(NOTE)
    const text = await railText(requestId)
    expect(text).toContain('|Withdrawn|July 14, 2027|')
    expect(text).toContain(`|How it was withdrawn|${NOTE}|`)
  })

  it('without a series starting from the completion, the date comes from the audit entry', async () => {
    const requestId = await closed('withdrawn', NOTE)
    const events = await handle.db
      .select()
      .from(recordEvents)
      .where(eq(recordEvents.rtkRequestId, requestId))
    expect(events).toHaveLength(0)
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, requestId), eq(auditLog.action, 'rtk.request_withdrawn')))
    expect(audit?.after).toMatchObject({ status: 'withdrawn', withdrawalNote: NOTE })
    const text = await railText(requestId)
    expect(text).toContain('|Withdrawn|July 14, 2027|')
    expect(text).toContain(NOTE)
  })

  it('a closed request shows Closed with its date and keeps no note', async () => {
    const requestId = await closed('closed', NOTE)
    const view = await rtkRequestView(handle.db, custodian, requestId, TODAY, signal)
    expect(view.ok && view.value.withdrawalNote).toBeNull()
    const text = await railText(requestId)
    expect(text).toContain('|Closed|July 14, 2027|')
    expect(text).not.toContain('How it was withdrawn')
  })

  it('a blank note is not kept', async () => {
    const requestId = await closed('withdrawn', '   ')
    const view = await rtkRequestView(handle.db, custodian, requestId, TODAY, signal)
    expect(view.ok && view.value.withdrawalNote).toBeNull()
  })
})
