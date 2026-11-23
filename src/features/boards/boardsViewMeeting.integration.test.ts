import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadBoardsView } from '@/features/boards/boardsView'
import { formatCivilDate } from '@/lib/formatDate'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { heldZbaHearing, scheduledZbaHearing } from '@/test/hearingFixtures'

const signal = new AbortController().signal
const HEARING = '2027-04-15'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: [HEARING] })
})
afterEach(async () => {
  await handle.drop()
})

async function lineFor(applicationId: string) {
  const view = await loadBoardsView(handle.db, world.staff, signal, BOARD_FIXTURE_NOW)
  const lines = view?.sections.flatMap((s) => s.applications) ?? []
  return lines.find((l) => l.id === applicationId)
}

describe('the meeting column on the boards page', () => {
  it("shows the scheduled hearing's meeting date for a variance", async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    expect(await lineFor(hearing.applicationId)).toMatchObject({
      meetingOn: HEARING,
      meetingText: formatCivilDate(HEARING),
    })
  })

  it("shows the held hearing's meeting date once the hearing is held", async () => {
    const hearing = await heldZbaHearing(handle.db, world)
    expect(await lineFor(hearing.applicationId)).toMatchObject({ meetingOn: HEARING })
  })
})
