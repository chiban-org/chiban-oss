import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationSnapshots, dispositionTombstones } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { approveDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2028-03-02T15:00:00Z')
const ATTESTATION = attestationHash(appTypeBody().attestationText)
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let custodian: Actor
let snapshotId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  custodian = await staffActor(handle.db, 'records_custodian')
  await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', FORM_BODY)
  const app = await makeApplication(handle.db, world)
  const submitted = await submitApplication(
    handle.db,
    world.applicant,
    {
      applicationId: app.applicationId,
      values: { classification: 'residential' },
      attestation: { statementSha256: ATTESTATION },
    },
    signal,
    new Date('2027-01-20T15:00:00Z'),
    store,
  )
  if (!submitted.ok) throw new Error('submit')
  const moved = await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      world.applicant,
      {
        applicationId: app.applicationId,
        to: 'withdrawn',
        expectedRowVersion: 2,
        onDate: d('2027-02-01'),
      },
      signal,
    ),
  )
  if (!moved.ok) throw new Error('withdraw')
  const [snap] = await handle.db
    .select()
    .from(applicationSnapshots)
    .where(eq(applicationSnapshots.applicationId, app.applicationId))
  snapshotId = snap?.id ?? ''
})
afterEach(async () => {
  await handle.drop()
})

describe('application snapshot disposition', () => {
  it('snapshot delete outside a batch still raises', async () => {
    await expectDbError(
      handle.db.delete(applicationSnapshots).where(eq(applicationSnapshots.id, snapshotId)),
      /insert-only/,
    )
    await expectDbError(
      handle.db.update(applicationSnapshots).set({ reason: 'amendment' }),
      /insert-only/,
    )
  })

  it('an executed batch deletes the snapshot and leaves a tombstone with the withdrawal basis', async () => {
    const proposed = await proposeDisposition(
      handle.db,
      world.staff,
      { asOf: d('2028-02-01') },
      signal,
      NOW,
    )
    if (!proposed.ok) throw new Error(`propose ${proposed.error}`)
    await approveDisposition(handle.db, custodian, { batchId: proposed.value.batchId }, signal)
    const ran = await executeDisposition(handle.db, { batchId: proposed.value.batchId }, signal)
    expect(ran.ok && ran.value.disposed).toBeGreaterThanOrEqual(1)
    expect(
      await handle.db
        .select()
        .from(applicationSnapshots)
        .where(eq(applicationSnapshots.id, snapshotId)),
    ).toEqual([])
    const [tombstone] = await handle.db
      .select()
      .from(dispositionTombstones)
      .where(eq(dispositionTombstones.recordId, snapshotId))
    expect(tombstone).toMatchObject({
      recordKind: 'application_snapshot',
      seriesKey: 'nh.rs.building_permits_withdrawn_denied',
      versionIds: [],
      fileSha256s: [],
    })
    expect(tombstone?.retentionBasis).toMatchObject({
      state: 'eligible_on',
      eligibleOn: '2028-02-01',
    })
  })
})
