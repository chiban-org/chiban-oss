import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { notificationOutbox, projectParties, townSettings } from '@/db/schema'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { queueNotification } from '@/features/notifications/queue'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

async function queueSubmitted(applicationId: string) {
  await handle.db.transaction((tx) =>
    queueNotification(
      tx,
      {
        event: 'application_submitted',
        applicationId,
        recipientUserIds: [world.applicant.userId],
      },
      signal,
    ),
  )
}

describe('notification wording from settings', () => {
  it('names the town from its settings rather than the demo town', async () => {
    await handle.db.update(townSettings).set({ name: 'Town of Birch Hollow' })
    const app = await makeApplication(handle.db, world)
    await queueSubmitted(app.applicationId)
    await sendQueuedNotifications(handle.db, mail, signal)
    expect(mail.sent[0]?.text).toContain(
      `The Town of Birch Hollow received application ${app.number}.`,
    )
    expect(mail.sent[0]?.text).not.toContain('Alder Pond')
  })

  it('sends the published staff wording with the applicant name, escaped in HTML', async () => {
    const app = await makeApplication(handle.db, world)
    const [party] = await handle.db
      .select({ id: projectParties.id })
      .from(projectParties)
      .where(eq(projectParties.projectId, world.projectId))
    await handle.db
      .update(projectParties)
      .set({ name: 'Robin <Ames>' })
      .where(eq(projectParties.id, party?.id ?? ''))
    await saveAndPublish(handle.db, world.admin, 'notification_wording', 'default', {
      key: 'default',
      events: {
        application_submitted: {
          subject: '{{town.name}} has {{application.number}}',
          body: 'Hello {{applicant.name}}.\n\nWe have your application.',
        },
      },
    })
    await queueSubmitted(app.applicationId)
    const [row] = await handle.db.select().from(notificationOutbox)
    expect(row?.payload).toMatchObject({ applicantName: 'Robin <Ames>' })
    await sendQueuedNotifications(handle.db, mail, signal)
    const sent = mail.sent[0]
    expect(sent?.subject).toBe(`Town of Alder Pond has ${app.number}`)
    expect(sent?.text).toContain('Hello Robin <Ames>.')
    expect(sent?.html).toContain('Hello Robin &lt;Ames&gt;.')
    expect(sent?.text).toContain(`/portal/applications/${app.applicationId}`)
  })
})
