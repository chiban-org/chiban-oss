import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { acceptWithoutDocument } from '@/features/applications/documentItems'
import { transitionApplication } from '@/features/applications/transition'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { blockedKeys, ITEMS, moveTo, submitAs } from '@/test/documentItemFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

async function accept(applicationId: string, itemKey: string): Promise<void> {
  const done = await acceptWithoutDocument(
    handle.db,
    world.staff,
    { applicationId, itemKey, reason: 'Seen at the counter.' },
    signal,
  )
  expect(done.ok).toBe(true)
}

async function close(
  applicationId: string,
  closureReason: 'certificate_of_occupancy' | 'revoked_on_appeal',
) {
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(sql`${applications.id} = ${applicationId}`)
  return await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      world.staff,
      { applicationId, to: 'closed', closureReason, expectedRowVersion: row?.rowVersion ?? 0 },
      signal,
    ),
  )
}

describe('document gates on transitions', () => {
  beforeEach(async () => {
    world = await setupPermitWorld(handle.db, { buildingType: { documents: ITEMS } })
  })

  it('blocks the decision until the decision items are provided or accepted', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'under_review' })
    expect(blockedKeys(await moveTo(handle.db, world.staff, applicationId, 'decided'))).toContain(
      'documents.before_decision',
    )
    await accept(applicationId, 'drainage_study')
    expect(
      blockedKeys(await moveTo(handle.db, world.staff, applicationId, 'decided')),
    ).not.toContain('documents.before_decision')
  })

  it('blocks issuance on decision and issuance items, so a direct issue cannot skip them', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'decided' })
    const refused = await moveTo(handle.db, world.staff, applicationId, 'issued')
    expect(blockedKeys(refused)).toContain('documents.before_issue')
    expect(JSON.stringify(refused)).toContain(
      'Documents not provided: Drainage study; State septic approval.',
    )
    await accept(applicationId, 'drainage_study')
    await accept(applicationId, 'septic_approval')
    expect(
      blockedKeys(await moveTo(handle.db, world.staff, applicationId, 'issued')),
    ).not.toContain('documents.before_issue')
  })

  it('blocks the certificate of occupancy close but not a close for another reason', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'issued' })
    expect(blockedKeys(await close(applicationId, 'certificate_of_occupancy'))).toContain(
      'documents.before_co',
    )
    expect(blockedKeys(await close(applicationId, 'revoked_on_appeal'))).not.toContain(
      'documents.before_co',
    )
  })
})

describe('type versions without a document list', () => {
  it('leaves applications pinned to an earlier version free of the new requirements', async () => {
    world = await setupPermitWorld(handle.db)
    const pinnedEarlier = await makeApplication(handle.db, world)
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'BP',
      appTypeBody({ documents: ITEMS }),
    )
    const pinnedLater = await makeApplication(handle.db, world)
    expect(await submitAs(handle.db, world.applicant, pinnedEarlier.applicationId)).toEqual({
      ok: true,
      value: { state: 'submitted' },
    })
    expect(
      blockedKeys(await submitAs(handle.db, world.applicant, pinnedLater.applicationId)),
    ).toEqual(['documents.to_file'])
    expect(
      blockedKeys(
        await moveTo(handle.db, world.staff, pinnedEarlier.applicationId, 'under_review'),
      ),
    ).toEqual([])
  })
})
