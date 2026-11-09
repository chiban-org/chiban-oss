import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { listContractorProjects } from '@/features/contractors/dashboard'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

const signal = new AbortController().signal
const NOW = new Date('2027-03-10T15:00:00Z')
const BEFORE_ISSUE = {
  key: 'energy_form',
  label: 'Energy form.',
  stage: 'before_issue' as const,
  waivable: false,
}

let handle: TestDb
let contractor: Actor
let direct = ''
let reviewed = ''

beforeAll(async () => {
  handle = await makeTestDb()
  const world = await setupPermitWorld(handle.db, {
    buildingType: {
      documents: [BEFORE_ISSUE],
      workflow: { allowsDirectIssue: true, substeps: [], closesOn: 'certificate_of_occupancy' },
    },
  })
  direct = (await makeApplication(handle.db, world, { state: 'submitted' }, NOW, 'BP'))
    .applicationId
  const userId = await makeUser(handle.db, { role: 'applicant', email: 'pat@builder.example' })
  contractor = (await loadActor(handle.db, userId, signal)) as Actor
  await handle.db.insert(projectParties).values({
    projectId: world.projectId,
    userId,
    email: 'pat@builder.example',
    name: 'Pat Builder',
    role: 'contractor',
    addedBy: userId,
  })
  reviewed = direct
})
afterAll(async () => {
  await handle.drop()
})

describe('documents requested follow the gates of the next transitions', () => {
  it('counts before-issue documents for a direct-issue type still in submitted', async () => {
    const { needs } = await listContractorProjects(
      handle.db,
      contractor,
      { limit: 25 },
      signal,
      NOW,
    )
    const docs = needs.find((n) => n.kind === 'documents')
    expect(docs?.text).toContain('Energy form')
    expect(docs?.href).toContain(reviewed)
  })
})
