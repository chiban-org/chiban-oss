import { ME_STARTERS } from '@packs/me/starters'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, documents, incompleteNotices } from '@/db/schema'
import { sendIncompleteNotice } from '@/features/applications/incompleteNotice'
import { startClocksFor } from '@/features/clocks/startClocks'
import { adoptStarter } from '@/features/config/adoptStarter'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'
import { clockRows } from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const NOW = new Date('2027-03-04T17:00:00Z')
const RECEIVED = '2027-03-01' as CivilDate
const REASON = 'The HHE-200 site evaluation form is not signed by the site evaluator.'
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

async function submitted(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'submitted', receivedDate: RECEIVED },
    NOW,
    typeKey,
  )
  await handle.db.transaction((tx) =>
    startClocksFor(tx, made.applicationId, 'application_received', RECEIVED, signal),
  )
  return made.applicationId
}

function send(applicationId: string) {
  return sendIncompleteNotice(
    handle.db,
    world.staff,
    { applicationId, reason: REASON },
    { store, signal, now: NOW },
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const starter of ME_STARTERS) {
    const adopted = await adoptStarter(handle.db, world.admin, starter.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
  }
  store = (await makeTestStore()).store
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('an incomplete notice on a subsurface wastewater application', () => {
  it('attaches one notice naming what is missing, meets the completeness date and leaves the application submitted', async () => {
    const applicationId = await submitted('SSW')
    const sent = await send(applicationId)
    if (!sent.ok) throw new Error(sent.error)

    const attached = await handle.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.recordKind, 'application'), eq(documents.recordId, applicationId)))
    expect(attached).toHaveLength(1)
    const text = await pdfWording(await downloadObject(handle.db, store, attached[0]?.id ?? ''))
    expect(text.replace(/\s+/g, ' ')).toContain(REASON)

    const [notice] = await handle.db
      .select()
      .from(incompleteNotices)
      .where(eq(incompleteNotices.applicationId, applicationId))
    expect(notice).toMatchObject({
      reason: REASON,
      sentOn: '2027-03-04',
      documentId: attached[0]?.id,
    })

    const clock = (await clockRows(handle.db, applicationId)).find(
      (c) => c.ruleKey === 'me.ssw.completeness',
    )
    expect(clock).toMatchObject({ status: 'met' })

    const [row] = await handle.db
      .select({ state: applications.state, completedDate: applications.completedDate })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(row).toEqual({ state: 'submitted', completedDate: null })
  })

  it('is not offered on a building permit', async () => {
    expect(await send(await submitted('BP'))).toEqual({ ok: false, error: 'not_applicable' })
  })

  it('is signed by the plumbing inspector', async () => {
    const published = await publishTownProfileSection(
      handle.db,
      world.admin,
      {
        section: 'signers',
        slice: {
          signers: [
            {
              role: 'building_official',
              name: 'Rowan Ashby',
              title: 'Code Enforcement Officer',
              signature: null,
            },
            {
              role: 'plumbing_inspector',
              name: 'Lee Piper',
              title: 'Local Plumbing Inspector',
              signature: null,
            },
          ],
        },
      },
      signal,
    )
    if (!published.ok) throw new Error(JSON.stringify(published.error))
    const applicationId = await submitted('SSW')
    const sent = await send(applicationId)
    if (!sent.ok) throw new Error(sent.error)
    const [notice] = await handle.db
      .select({ documentId: incompleteNotices.documentId })
      .from(incompleteNotices)
      .where(eq(incompleteNotices.applicationId, applicationId))
    const text = await pdfWording(await downloadObject(handle.db, store, notice?.documentId ?? ''))
    expect(text).toContain('Lee Piper')
    expect(text).not.toContain('Rowan Ashby')
  })
})
