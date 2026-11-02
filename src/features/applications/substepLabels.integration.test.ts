import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { substepLabelsFor } from '@/features/applications/substepLabels'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    buildingType: {
      workflow: {
        allowsDirectIssue: false,
        closesOn: 'certificate_of_occupancy',
        substeps: [
          { state: 'issued', key: 'co_pending', label: 'Certificate of occupancy pending' },
        ],
      },
    },
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('substepLabelsFor', () => {
  it('maps each application with a substep to the label its type declares', async () => {
    const withStep = await makeApplication(handle.db, world, {
      state: 'issued',
      substep: 'co_pending',
    } as never)
    const without = await makeApplication(handle.db, world)
    const labels = await substepLabelsFor(
      handle.db,
      [withStep.applicationId, without.applicationId],
      signal,
    )
    expect(labels.get(withStep.applicationId)).toBe('Certificate of occupancy pending')
    expect(labels.has(without.applicationId)).toBe(false)
  })
})
