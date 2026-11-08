import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadBoardsView } from '@/features/boards/boardsView'
import { assignBoardForComment, withdrawBoardAssignment } from '@/features/reviews/boardAssignments'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { addBoard } from '@/test/boardReviewFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let conservation = ''
let historic = ''

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  conservation = await addBoard(handle.db, {
    kind: 'conservation_commission',
    name: 'Alder Pond Conservation Commission',
    shortName: 'Conservation Commission',
  })
  historic = await addBoard(handle.db, {
    kind: 'historic_district_commission',
    name: 'Alder Pond Historic District Commission',
    shortName: 'Historic District Commission',
  })
})
afterAll(async () => {
  await handle.drop()
})

async function section(boardId: string) {
  const view = await loadBoardsView(handle.db, world.staff, signal)
  const found = view?.sections.find((s) => s.boardId === boardId)
  if (found === undefined) throw new Error('no section')
  return found
}

describe('applications sent to a board for comment on the board applications list', () => {
  it('lists none for a board nothing was sent to', async () => {
    expect((await section(historic)).commentRequests).toEqual([])
  })

  it('lists an application sent to a commission with its comment-by date and status', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const sent = await assignBoardForComment(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        boardId: conservation,
        commentBy: '2027-03-05' as CivilDate,
      },
      signal,
    )
    expect(sent.ok).toBe(true)
    const [line] = (await section(conservation)).commentRequests
    expect(line).toMatchObject({
      applicationId: app.applicationId,
      statusLabel: 'Waiting for comments',
      commentByText: 'March 5, 2027',
    })
    expect(line?.number).toBe(app.number)
    expect((await section(historic)).commentRequests).toEqual([])
  })

  it('drops a withdrawn request', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const sent = await assignBoardForComment(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, boardId: historic, commentBy: null },
      signal,
    )
    if (!sent.ok) throw new Error('not sent')
    expect((await section(historic)).commentRequests).toHaveLength(1)
    await withdrawBoardAssignment(
      handle.db,
      world.staff,
      { assignmentId: sent.value.assignmentId },
      signal,
    )
    expect((await section(historic)).commentRequests).toEqual([])
  })
})
