import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, rtkRequests } from '@/db/schema'
import { computeSubjectDue } from '@/features/clocks/subjectDue'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { MailTransport } from '@/features/mail/transport'
import { rtkDueContext } from '@/features/rtk/dueContext'
import { resetOnlineRequestLimits, submitOnlineRequest } from '@/features/rtk/onlineRequest'
import { requesterEmailOf } from '@/features/rtk/requesterEmail'
import { responseRule } from '@/features/rtk/requests'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'
import { err } from '@/types/result'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const TODAY = '2027-07-14' as CivilDate
let handle: TestDb

const INPUT = {
  requesterName: 'Jordan Reyes',
  email: 'Jordan@Example.test',
  phone: '603-555-0142',
  description: 'Septic plans for 14 Birch Lane <a href="https://spam.example">win</a>',
  clientKey: 'client-1',
}

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  resetOnlineRequestLimits()
})
afterEach(async () => {
  await handle.drop()
})

describe('submitOnlineRequest', () => {
  it('records the request as received online today and starts the response clock', async () => {
    const mail = createMemoryTransport()
    const result = await submitOnlineRequest({ db: handle.db, mail, signal, now: NOW }, INPUT)
    if (!result.ok) throw new Error(result.error)
    const [row] = await handle.db
      .select()
      .from(rtkRequests)
      .where(eq(rtkRequests.id, result.value.requestId))
    const due = computeSubjectDue(responseRule(), TODAY, rtkDueContext())
    expect(row).toMatchObject({
      receivedOn: TODAY,
      receivedVia: 'portal',
      requesterName: 'Jordan Reyes',
      status: 'open',
      openDueOn: due.due,
      createdBy: null,
    })
    expect(row?.responseDue).toEqual(due)
    expect(requesterEmailOf(row?.requesterContact ?? null)).toBe('jordan@example.test')
    expect(row?.requesterContact).toContain('603-555-0142')
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, row?.id ?? ''))
    expect(audits.map((a) => a.action)).toEqual(['rtk.request_logged'])
  })

  it('emails a receipt with the number and due date and nothing the requester typed', async () => {
    const mail = createMemoryTransport()
    const result = await submitOnlineRequest({ db: handle.db, mail, signal, now: NOW }, INPUT)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.emailed).toBe(true)
    const [receipt] = mail.sent
    expect(receipt?.to).toBe('jordan@example.test')
    expect(receipt?.subject).toBe(`Right-to-Know request ${result.value.number} received`)
    expect(receipt?.text).toContain(result.value.number)
    expect(receipt?.text).toContain('July 14, 2027')
    for (const body of [receipt?.text ?? '', receipt?.html ?? '']) {
      expect(body).not.toContain('Septic')
      expect(body).not.toContain('spam.example')
      expect(body).not.toContain('Jordan Reyes')
    }
  })

  it('keeps the request when the receipt cannot be sent', async () => {
    const failing: MailTransport = { send: () => Promise.resolve(err('send_failed')) }
    const result = await submitOnlineRequest(
      { db: handle.db, mail: failing, signal, now: NOW },
      INPUT,
    )
    expect(result).toMatchObject({ ok: true, value: { emailed: false } })
    expect(await handle.db.select().from(rtkRequests)).toHaveLength(1)
  })

  it('refuses a missing description or a bad email address', async () => {
    const mail = createMemoryTransport()
    expect(
      await submitOnlineRequest(
        { db: handle.db, mail, signal, now: NOW },
        { ...INPUT, description: ' ' },
      ),
    ).toEqual(err('invalid'))
    expect(
      await submitOnlineRequest(
        { db: handle.db, mail, signal, now: NOW },
        { ...INPUT, email: 'nope' },
      ),
    ).toEqual(err('invalid'))
    expect(await handle.db.select().from(rtkRequests)).toHaveLength(0)
  })

  it('stops repeated requests from one address and from one client', async () => {
    const mail = createMemoryTransport()
    const submit = (patch: Partial<typeof INPUT>) =>
      submitOnlineRequest({ db: handle.db, mail, signal, now: NOW }, { ...INPUT, ...patch })
    for (let i = 0; i < 3; i++) expect((await submit({})).ok).toBe(true)
    expect(await submit({ clientKey: 'client-2' })).toEqual(err('rate_limited'))
    for (let i = 0; i < 7; i++) {
      expect((await submit({ email: `person${i}@example.test` })).ok).toBe(true)
    }
    expect(await submit({ email: 'another@example.test' })).toEqual(err('rate_limited'))
    expect(await handle.db.select().from(rtkRequests)).toHaveLength(10)
  })
})
