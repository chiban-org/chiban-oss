import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { files } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { deliverRequestLetter } from '@/features/rtk/letterDelivery'
import { resetOnlineRequestLimits, submitOnlineRequest } from '@/features/rtk/onlineRequest'
import { MAX_ATTACHED_BYTES } from '@/features/rtk/releaseMail'
import { createRelease } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import type { ObjectStore } from '@/features/storage/objectStore'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { loggedRequest, RTK_RECEIVED_ON, RTK_TODAY, releasableRecord } from '@/test/rtkFixtures'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let admin: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  admin = await staffActor(handle.db, 'admin')
  resetOnlineRequestLimits()
})
afterEach(async () => {
  await handle.drop()
})

async function publishWording(key: string, subject: string, body: string) {
  await saveAndPublish(handle.db, admin, 'notification_wording', 'default', {
    key: 'default',
    events: { [key]: { subject, body } },
  })
}

describe('request emails use published wording', () => {
  it('sends the online receipt with the override and the town link', async () => {
    await publishWording(
      'rtk_request_received',
      '{{town.name}} has request {{request.number}}',
      'We will answer by {{request.due}}.',
    )
    const mail = createMemoryTransport()
    const result = await submitOnlineRequest(
      { db: handle.db, mail, signal, now: new Date('2027-07-14T15:00:00Z') },
      {
        requesterName: 'Jordan Reyes',
        email: 'jordan@example.test',
        description: 'Septic plans for 14 Birch Lane',
        clientKey: 'client-1',
      },
    )
    if (!result.ok) throw new Error(result.error)
    const [sent] = mail.sent
    expect(sent?.subject).toBe(`Town of Alder Pond has request ${result.value.number}`)
    expect(sent?.text).toContain('We will answer by ')
    expect(sent?.text).not.toContain('Keep the request number')
    expect(sent?.text).toContain(env.BASE_URL)
  })

  it('sends the letter email with the override and keeps the attachment', async () => {
    await publishWording(
      'rtk_letter_sent',
      'Your letter {{request.number}}',
      'The letter for {{request.number}} is attached.',
    )
    const logged = await logRequest(
      handle.db,
      custodian,
      {
        receivedOn: RTK_RECEIVED_ON,
        receivedVia: 'mail',
        requesterContact: 'jordan@example.test',
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
    const mail = createMemoryTransport()
    await deliverRequestLetter({ db: handle.db, store, mail, signal }, custodian, {
      requestId: logged.value.requestId,
      documentId: responded.value.letterDocumentId,
    })
    const [sent] = mail.sent
    expect(sent?.subject).toBe('Your letter RK-2026-0001')
    expect(sent?.text).toBe('The letter for RK-2026-0001 is attached.\n')
    expect(sent?.attachments?.map((a) => a.contentType)).toEqual(['application/pdf'])
  })

  async function releaseBy(method: 'email', makeTooLarge: boolean) {
    const requestId = await loggedRequest(handle.db, custodian)
    const record = await releasableRecord(handle.db, store, custodian, requestId)
    if (makeTooLarge) await handle.db.update(files).set({ sizeBytes: MAX_ATTACHED_BYTES + 1 })
    const mail = createMemoryTransport()
    const result = await createRelease(
      handle.db,
      store,
      mail,
      custodian,
      {
        requestId,
        releasedOn: '2026-11-04',
        method,
        items: [{ documentId: record.documentId, approvalId: record.approvalId }],
        recipientEmail: 'jordan@example.test',
      },
      signal,
      RTK_TODAY,
    )
    if (!result.ok) throw new Error(result.error)
    return mail.sent[0]
  }

  it('sends the release link email with the override and appends the link', async () => {
    await publishWording(
      'rtk_records_link',
      'Ready: {{request.number}}',
      'Records for {{request.number}} are ready for {{link.days}} days.{{records.linkNote}}',
    )
    const sent = await releaseBy('email', true)
    expect(sent?.subject).toBe('Ready: RK-2026-0001')
    expect(sent?.text).toContain('are ready for 30 days. The files were too large')
    expect(sent?.text).toContain(`${env.BASE_URL}/records/releases/`)
    expect(sent?.attachments?.map((a) => a.filename)).toEqual(['RK-2026-0001-release-1.pdf'])
  })

  it('sends the attached-records email with the override and keeps the attachments', async () => {
    await publishWording(
      'rtk_records_attached',
      'Records {{request.number}}',
      'Attached: records released {{records.releasedOn}}.',
    )
    const sent = await releaseBy('email', false)
    expect(sent?.subject).toBe('Records RK-2026-0001')
    expect(sent?.text).toBe('Attached: records released November 4, 2026.\n')
    expect(sent?.attachments?.map((a) => a.filename)).toEqual([
      'letter.pdf',
      'RK-2026-0001-release-1.pdf',
    ])
  })
})
