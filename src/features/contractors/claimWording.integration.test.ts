import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sendContractorClaim } from '@/features/contractors/claims'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('claim email wording', () => {
  it('sends the published claim wording with the claim link', async () => {
    await makeApplication(handle.db, world)
    await saveAndPublish(handle.db, world.admin, 'notification_wording', 'default', {
      key: 'default',
      events: {
        project_claim: {
          subject: '{{town.name}}: claim {{project.title}}',
          body: 'Hi {{recipient.name}}, you are {{claim.namedAs}}. The link lasts {{link.days}} days.',
        },
      },
    })
    const mail = createMemoryTransport()
    const sent = await sendContractorClaim(
      handle.db,
      mail,
      world.staff,
      { projectId: world.projectId, email: 'pat@alderpond.example', name: 'Pat Builder' },
      signal,
    )
    expect(sent.ok).toBe(true)
    const message = mail.sent[0]
    expect(message?.subject).toBe('Town of Alder Pond: claim Garage addition')
    expect(message?.text).toContain(
      'Hi Pat Builder, you are as a contractor on a project. The link lasts 14 days.',
    )
    expect(message?.text).toMatch(/\/claim\/[A-Za-z0-9_-]+/)
    expect(message?.html).toContain('Claim the project')
  })
})
