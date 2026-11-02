import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { calendarAccounts, calendarPushes, inspectorCalendars } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { saveCalendarAccount } from '@/features/calendar/calendarAccounts'
import { deliverPush } from '@/features/calendar/deliverPush'
import { createGraphPublisher, GRAPH_ADAPTER_STATUS } from '@/features/calendar/graphPublisher'
import type { CalendarBooking } from '@/features/calendar/ics'
import { createIcsEmailPublisher } from '@/features/calendar/icsEmailPublisher'
import { createLazyGraphPublisher } from '@/features/calendar/lazyGraphPublisher'
import { queueCalendarPush } from '@/features/calendar/queuePush'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { decryptSecret } from '@/server/secrets'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_TENANT_ID,
  type GraphFakeServer,
  startGraphFakeServer,
} from '@/test/fakes/graphFakeServer'
import {
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { ok } from '@/types/result'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld
let fake: GraphFakeServer
let clock = INSPECTION_NOW.getTime()

const booking: CalendarBooking = {
  uid: 'inspection-abc@alderpond.example',
  sequence: 0,
  startUtc: new Date('2027-11-08T14:30:00Z'),
  endUtc: new Date('2027-11-08T15:30:00Z'),
  summary: 'Final inspection, EL-2027-0001',
  description: 'Site: 12 Elm Road',
  location: '12 Elm Road',
  organizerEmail: 'noreply@alderpond.example',
  attendeeEmail: 'inspector@alderpond.example',
  attendeeName: 'Ines Inspector',
  targetUserRef: 'inspector@alderpond.example',
}

function account(secret = FAKE_CLIENT_SECRET) {
  return {
    account: {
      id: 'acct-1',
      kind: 'graph' as const,
      tenantId: FAKE_TENANT_ID,
      clientId: FAKE_CLIENT_ID,
      authorityBase: fake.authorityBase,
      graphBase: fake.graphBase,
    },
    secret,
  }
}

function publisher(secret = FAKE_CLIENT_SECRET) {
  const { account: a, secret: s } = account(secret)
  return createGraphPublisher(a, s, { fetch, now: () => new Date(clock) })
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  fake = await startGraphFakeServer()
})
afterAll(async () => {
  await fake.stop()
  await handle.drop()
})

describe('graph publisher against the fake tenant', () => {
  it('connect obtains a token with client credentials', async () => {
    const r = await publisher().publish(booking, null, signal)
    expect(r.ok).toBe(true)
    const tokenCall = fake.requests.find((q) => q.path.endsWith('/oauth2/v2.0/token'))
    expect(tokenCall?.method).toBe('POST')
    const form = new URLSearchParams(String(tokenCall?.body))
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('scope')).toBe('https://graph.microsoft.com/.default')
  })

  it('first run creates an event and returns its id', async () => {
    fake.events.clear()
    const r = await publisher().publish(
      { ...booking, uid: 'inspection-first@alderpond.example' },
      null,
      signal,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.externalRef).toBe('event-1')
    expect(fake.events.size).toBe(1)
    const create = fake.requests
      .filter((q) => q.method === 'POST' && q.path.endsWith('/events'))
      .at(-1)
    expect(create?.path).toBe('/v1.0/users/inspector%40alderpond.example/events')
    expect(create?.body).toMatchObject({
      subject: 'Final inspection, EL-2027-0001',
      start: { dateTime: '2027-11-08T14:30:00', timeZone: 'UTC' },
      end: { dateTime: '2027-11-08T15:30:00', timeZone: 'UTC' },
      transactionId: 'inspection-first@alderpond.example:0',
    })
  })

  it('second run with the previous ref patches the same event, never creating a second', async () => {
    fake.events.clear()
    const p = publisher()
    const first = await p.publish(
      { ...booking, uid: 'inspection-second@alderpond.example' },
      null,
      signal,
    )
    if (!first.ok) throw new Error('first failed')
    const moved = await p.publish(
      {
        ...booking,
        uid: 'inspection-second@alderpond.example',
        sequence: 1,
        startUtc: new Date('2027-11-10T14:30:00Z'),
        endUtc: new Date('2027-11-10T15:30:00Z'),
      },
      first.value.externalRef,
      signal,
    )
    expect(moved.ok && moved.value.externalRef).toBe(first.value.externalRef)
    expect(fake.events.size).toBe(1)
    expect(fake.requests.at(-1)?.method).toBe('PATCH')
    expect(JSON.stringify([...fake.events.values()])).toContain('2027-11-10T14:30:00')
  })

  it('cancel deletes the event; a 404 on delete counts as done', async () => {
    fake.events.clear()
    const p = publisher()
    const made = await p.publish(
      { ...booking, uid: 'inspection-cancel@alderpond.example' },
      null,
      signal,
    )
    if (!made.ok) throw new Error('create failed')
    expect((await p.cancel(booking, made.value.externalRef, signal)).ok).toBe(true)
    expect(fake.events.size).toBe(0)
    expect((await p.cancel(booking, made.value.externalRef, signal)).ok).toBe(true)
  })

  it('a wrong client secret is auth_failed', async () => {
    const r = await publisher('wrong-secret').publish(booking, null, signal)
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ kind: 'auth_failed' }) })
  })

  it('the token is reused until 60 seconds before expiry', async () => {
    fake.setTokenLifetime(3600)
    const p = publisher()
    const before = fake.tokensIssued()
    await p.publish({ ...booking, uid: 'inspection-t1@alderpond.example' }, null, signal)
    clock += 3000 * 1000
    await p.publish({ ...booking, uid: 'inspection-t2@alderpond.example' }, null, signal)
    expect(fake.tokensIssued() - before).toBe(1)
    clock += 541 * 1000
    await p.publish({ ...booking, uid: 'inspection-t3@alderpond.example' }, null, signal)
    expect(fake.tokensIssued() - before).toBe(2)
  })

  it('throttling and server errors are unreachable, other client errors are rejected', async () => {
    const p = publisher()
    await p.publish({ ...booking, uid: 'inspection-warm@alderpond.example' }, null, signal)
    fake.failNext(429)
    expect(await p.publish(booking, null, signal)).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: 'unreachable' }),
    })
    fake.failNext(503)
    expect(await p.publish(booking, null, signal)).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: 'unreachable' }),
    })
    fake.failNext(400)
    expect(await p.publish(booking, null, signal)).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: 'rejected' }),
    })
  })

  it('a response of the wrong shape is bad_shape', async () => {
    const stray = createGraphPublisher(account().account, account().secret, {
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.includes('/oauth2/')) return await fetch(input, init)
        return new Response(JSON.stringify({ unexpected: true }), { status: 201 })
      },
      now: () => new Date(clock),
    })
    expect(await stray.publish(booking, null, signal)).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: 'bad_shape' }),
    })
  })

  it('adapter reports stubbed', () => {
    expect(GRAPH_ADAPTER_STATUS).toBe('stubbed')
  })
})

describe('graph targets through the outbox', () => {
  async function connect(secret: string) {
    await handle.db.delete(calendarAccounts)
    const saved = await saveCalendarAccount(
      handle.db,
      w.world.admin,
      {
        tenantId: FAKE_TENANT_ID,
        clientId: FAKE_CLIENT_ID,
        clientSecret: secret,
        authorityBase: fake.authorityBase,
        graphBase: fake.graphBase,
      },
      signal,
    )
    if (!saved.ok) throw new Error('connect failed')
    return saved.value
  }

  let slotCounter = 0

  async function graphPush(): Promise<string> {
    slotCounter += 1
    await handle.db
      .insert(inspectorCalendars)
      .values({
        userId: w.inspector.userId,
        kind: 'graph',
        email: 'inspector@alderpond.example',
        graphUserId: 'inspector@alderpond.example',
        updatedBy: w.world.admin.userId,
      })
      .onConflictDoUpdate({ target: inspectorCalendars.userId, set: { kind: 'graph' } })
    const inspectionId = await insertInspection(handle.db, w.trade.applicationId, 'final', {
      status: 'scheduled',
      inspectorUserId: w.inspector.userId,
      scheduledDate: '2027-11-08',
      startMinute: 100 + slotCounter,
      durationMinutes: 60,
    })
    const pushId = await transactionResult(handle.db, async (tx) =>
      ok(
        await queueCalendarPush(
          tx,
          { inspectionId, sequence: 0, op: 'publish', inspectorUserId: w.inspector.userId },
          signal,
        ),
      ),
    )
    return pushId.ok && pushId.value !== null ? pushId.value : ''
  }

  function deps() {
    const lazy = createLazyGraphPublisher(handle.db, { fetch, now: () => new Date(clock) })
    const ics = createIcsEmailPublisher({
      mail: createMemoryTransport(),
      organizerEmail: 'noreply@alderpond.example',
    })
    return {
      publisherFor: (kind: 'ics_email' | 'graph') => (kind === 'graph' ? lazy : ics),
      now: INSPECTION_NOW,
    }
  }

  it('saving an account stores the secret encrypted and never returns it', async () => {
    const saved = await connect(FAKE_CLIENT_SECRET)
    expect(JSON.stringify(saved)).not.toContain(FAKE_CLIENT_SECRET)
    const [row] = await handle.db.select().from(calendarAccounts)
    expect(row?.clientSecretEnc).not.toContain(FAKE_CLIENT_SECRET)
    expect(decryptSecret(row?.clientSecretEnc ?? '')).toEqual({
      ok: true,
      value: FAKE_CLIENT_SECRET,
    })
  })

  it('saving an account without config.edit is forbidden', async () => {
    const r = await saveCalendarAccount(
      handle.db,
      w.world.staff,
      { tenantId: 't', clientId: 'c', clientSecret: 's' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a graph push creates the event, and a wrong client secret is auth_failed and the push stays queued', async () => {
    await connect(FAKE_CLIENT_SECRET)
    fake.events.clear()
    const good = await graphPush()
    expect(await deliverPush(handle.db, deps(), good, signal)).toEqual({ ok: true, value: 'sent' })
    expect(fake.events.size).toBe(1)
    const [sent] = await handle.db.select().from(calendarPushes).where(eq(calendarPushes.id, good))
    expect(sent?.externalRef).toBe('event-1')
    await connect('rotated-and-wrong')
    const bad = await graphPush()
    const r = await deliverPush(handle.db, deps(), bad, signal)
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ kind: 'auth_failed' }) })
    const [queued] = await handle.db.select().from(calendarPushes).where(eq(calendarPushes.id, bad))
    expect(queued).toMatchObject({ status: 'queued', attempts: 1 })
  })

  it('with no connected tenant a graph push fails as auth_failed and says why', async () => {
    await handle.db.delete(calendarAccounts)
    const pushId = await graphPush()
    const r = await deliverPush(handle.db, deps(), pushId, signal)
    expect(r).toEqual({
      ok: false,
      error: { kind: 'auth_failed', detail: 'no Microsoft tenant is connected' },
    })
  })
})
