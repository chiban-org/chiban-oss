import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alertTests } from '@/db/schema'
import { createEmailChannel } from '@/features/health/channels/emailChannel'
import { createPagerChannel } from '@/features/health/channels/pagerChannel'
import {
  acknowledgeAlert,
  alertReadiness,
  sendSyntheticAlert,
} from '@/features/health/syntheticAlert'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { type PagerFakeServer, startPagerFakeServer } from '@/test/fakes/pagerFakeServer'
import { seedTown } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2026-11-02T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)
let handle: TestDb
let pager: PagerFakeServer

beforeAll(async () => {
  handle = await makeTestDb()
  await seedTown(handle.db)
  pager = await startPagerFakeServer()
})
afterAll(async () => {
  await pager.stop()
  await handle.drop()
})
beforeEach(async () => {
  pager.requests.length = 0
  await handle.db.delete(alertTests)
})

function channels() {
  const mail = createMemoryTransport()
  return {
    mail,
    list: [
      createEmailChannel(mail, ['ops@alderpond.example']),
      createPagerChannel({ eventsUrl: pager.eventsUrl, routingKey: 'rk' }, { fetch }),
    ],
  }
}

function tokenFromEmail(text: string): string {
  const match = /\/alerts\/ack\/([A-Za-z0-9_-]{43})/.exec(text)
  if (match?.[1] === undefined) throw new Error('no ack link in email')
  return match[1]
}

describe('synthetic alert', () => {
  it('synthetic alert sends to email and pager with an ack link', async () => {
    const { mail, list } = channels()
    const sent = await sendSyntheticAlert(handle.db, list, signal, {
      now: NOW,
      createdByKind: 'cli',
    })
    expect(sent.map((s) => s.channel)).toEqual(['email', 'pager'])
    expect(mail.sent).toHaveLength(1)
    const token = tokenFromEmail(mail.sent[0]?.text ?? '')
    expect(mail.sent[0]?.subject).toContain('Town of Alder Pond')
    const pagerBody = pager.requests[0]?.body as { event_action: string; links: { href: string }[] }
    expect(pagerBody.event_action).toBe('trigger')
    expect(pagerBody.links[0]?.href).toMatch(
      /^https:\/\/alderpond\.example\/alerts\/ack\/[A-Za-z0-9_-]{43}$/,
    )
    const rows = await handle.db.select().from(alertTests)
    expect(rows).toHaveLength(2)
    const emailRow = rows.find((r) => r.channel === 'email')
    expect(emailRow?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(emailRow?.tokenHash).not.toContain(token)
    expect(emailRow?.createdByKind).toBe('cli')
  })

  it('a channel that fails to send leaves no test row and reports failure', async () => {
    const { list } = channels()
    pager.failNext(500)
    const sent = await sendSyntheticAlert(handle.db, list, signal, {
      now: NOW,
      createdByKind: 'cli',
    })
    expect(sent.map((s) => [s.channel, s.sent])).toEqual([
      ['email', true],
      ['pager', false],
    ])
    const rows = await handle.db.select().from(alertTests)
    expect(rows.map((r) => r.channel)).toEqual(['email'])
  })

  it('readiness moves from never_tested to sent_unacknowledged to acknowledged', async () => {
    const { mail, list } = channels()
    const kinds = ['email', 'pager'] as const
    const before = await alertReadiness(handle.db, [...kinds], NOW, signal)
    expect(before.map((r) => r.status)).toEqual(['never_tested', 'never_tested'])
    await sendSyntheticAlert(handle.db, list, signal, { now: NOW, createdByKind: 'cli' })
    const sent = await alertReadiness(handle.db, [...kinds], NOW, signal)
    expect(sent.map((r) => r.status)).toEqual(['sent_unacknowledged', 'sent_unacknowledged'])
    const token = tokenFromEmail(mail.sent[0]?.text ?? '')
    expect(await acknowledgeAlert(handle.db, token, days(1), signal)).toEqual({
      ok: true,
      value: undefined,
    })
    const acked = await alertReadiness(handle.db, [...kinds], days(2), signal)
    expect(acked.map((r) => [r.channel, r.status])).toEqual([
      ['email', 'acknowledged'],
      ['pager', 'sent_unacknowledged'],
    ])
    const lapsed = await alertReadiness(handle.db, [...kinds], days(40), signal)
    expect(lapsed[0]?.status).toBe('sent_unacknowledged')
  })

  it('an unknown token does not acknowledge anything', async () => {
    const { list } = channels()
    await sendSyntheticAlert(handle.db, list, signal, { now: NOW, createdByKind: 'cli' })
    expect(await acknowledgeAlert(handle.db, 'x'.repeat(43), NOW, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
    const [row] = await handle.db.select().from(alertTests).where(eq(alertTests.channel, 'email'))
    expect(row?.acknowledgedAt).toBeNull()
  })
})
