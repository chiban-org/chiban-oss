import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, rtkLetterDeliveries } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { MailTransport } from '@/features/mail/transport'
import { deliverRequestLetter } from '@/features/rtk/letterDelivery'
import { logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { RTK_RECEIVED_ON, RTK_TODAY } from '@/test/rtkFixtures'
import { err } from '@/types/result'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
})

async function respondedTo(requesterContact: string) {
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: RTK_RECEIVED_ON,
      receivedVia: 'mail',
      requesterContact,
      description: 'The Birch Lane owner letters',
    },
    signal,
    RTK_TODAY,
  )
  if (!logged.ok) throw new Error(logged.error)
  const responded = await recordFirstResponse(
    handle.db,
    store,
    custodian,
    {
      requestId: logged.value.requestId,
      kind: 'website_reference',
      respondedOn: '2026-11-04',
      websiteUrl: 'https://alderpond.example/records',
    },
    signal,
    RTK_TODAY,
  )
  if (!responded.ok) throw new Error(responded.error)
  return { requestId: logged.value.requestId, documentId: responded.value.letterDocumentId }
}

const deliver = (mail: MailTransport, letter: { requestId: string; documentId: string }) =>
  deliverRequestLetter({ db: handle.db, store, mail, signal }, custodian, letter)

describe('deliverRequestLetter', () => {
  it('emails the filed letter as a PDF to the requester and records it', async () => {
    const letter = await respondedTo('Jordan@example.test, 603-555-0142')
    const mail = createMemoryTransport()
    expect(await deliver(mail, letter)).toEqual({
      ok: true,
      value: { outcome: 'emailed', sentTo: 'jordan@example.test' },
    })
    const [sent] = mail.sent
    expect(sent?.to).toBe('jordan@example.test')
    expect(sent?.subject).toBe('Letter about Right-to-Know request RK-2026-0001')
    expect(sent?.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      ['RK-2026-0001-response.pdf', 'application/pdf'],
    ])
    expect(sent?.attachments?.[0]?.content.subarray(0, 5).toString()).toBe('%PDF-')
    const rows = await handle.db.select().from(rtkLetterDeliveries)
    expect(rows).toMatchObject([
      { requestId: letter.requestId, documentId: letter.documentId, outcome: 'emailed' },
    ])
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'rtk.letter_delivered'))
    expect(audits).toHaveLength(1)
  })

  it('marks the letter for printing when the request has no email address', async () => {
    const letter = await respondedTo('12 Birch Lane, Alder Pond')
    const mail = createMemoryTransport()
    expect(await deliver(mail, letter)).toEqual({
      ok: true,
      value: { outcome: 'print', sentTo: null },
    })
    expect(mail.sent).toHaveLength(0)
    expect(await handle.db.select().from(rtkLetterDeliveries)).toMatchObject([
      { outcome: 'print', sentTo: null },
    ])
  })

  it('records a failed email so staff know to print the letter', async () => {
    const letter = await respondedTo('jordan@example.test')
    const failing: MailTransport = { send: () => Promise.resolve(err('send_failed')) }
    expect(await deliver(failing, letter)).toMatchObject({
      ok: true,
      value: { outcome: 'email_failed' },
    })
    expect(await handle.db.select().from(rtkLetterDeliveries)).toMatchObject([
      { outcome: 'email_failed', sentTo: 'jordan@example.test' },
    ])
  })

  it('refuses someone without the Right-to-Know permission', async () => {
    const letter = await respondedTo('jordan@example.test')
    const reviewer = await staffActor(handle.db, 'reviewer')
    expect(
      await deliverRequestLetter(
        { db: handle.db, store, mail: createMemoryTransport(), signal },
        reviewer,
        letter,
      ),
    ).toEqual(err('forbidden'))
  })
})
