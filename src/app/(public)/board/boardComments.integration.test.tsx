import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setAudiences } from '@/features/documents/publish'
import { addReviewComment } from '@/features/reviews/assignments'
import { assignBoardForComment } from '@/features/reviews/boardAssignments'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { addBoard, seatMember } from '@/test/boardReviewFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { findIsoDates } from '@/test/leaks'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: BoardHomePage } = await import('./page')
const { default: CommentPage } = await import('./comments/[assignmentId]/page')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lee: Actor
let hal: Actor
let assignmentId = ''
let reviewersDoc = ''
let staffDoc = ''

function open(id: string) {
  return CommentPage({ params: Promise.resolve({ assignmentId: id }) })
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const { store } = await makeTestStore()
  world = await setupBoardWorld(handle.db)
  const conservation = await addBoard(handle.db, {
    kind: 'conservation_commission',
    name: 'Alder Pond Conservation Commission',
    shortName: 'Conservation Commission',
  })
  const historic = await addBoard(handle.db, {
    kind: 'historic_district_commission',
    name: 'Alder Pond Historic District Commission',
    shortName: 'Historic District Commission',
  })
  lee = await seatMember(handle.db, world.staff, {
    email: 'lee.marsh@alderpond.example',
    displayName: 'Lee Marsh',
    boardId: conservation,
  })
  hal = await seatMember(handle.db, world.staff, {
    email: 'hal.historic@alderpond.example',
    displayName: 'Hal Historic',
    boardId: historic,
  })
  const app = await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
  for (const [title, audiences] of [
    ['Wetland delineation', ['reviewers']],
    ['Staff memo', []],
  ] as const) {
    const made = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: app.applicationId },
      pdfBytes(title),
      { title },
    )
    await setAudiences(
      handle.db,
      world.admin,
      { documentId: made.documentId, audiences: [...audiences] },
      signal,
    )
    if (title === 'Staff memo') staffDoc = made.documentId
    else reviewersDoc = made.documentId
  }
  const sent = await assignBoardForComment(
    handle.db,
    world.staff,
    {
      applicationId: app.applicationId,
      boardId: conservation,
      commentBy: '2027-04-01' as CivilDate,
    },
    signal,
  )
  if (!sent.ok) throw new Error(sent.error)
  assignmentId = sent.value.assignmentId
})

afterAll(async () => {
  await handle.drop()
})

describe('Sent to your board for comment', () => {
  it('lists the application for a seated member, with its comment-by date, even with no meetings', async () => {
    state.actor = lee
    const html = renderToStaticMarkup(await BoardHomePage())
    const section = html.slice(html.indexOf('>Sent to your board for comment</h2>'))
    expect(section).toContain('Garage addition')
    expect(section).toContain('Conservation Commission. Comments by April 1, 2027.')
    expect(section).toContain('Waiting for comments')
    expect(section).toContain(`/board/comments/${assignmentId}`)
    expect(html).toContain('No meeting packets are ready for you yet.')
    expect(findIsoDates(html.replace(/href="[^"]*"/g, ''))).toEqual([])
  })

  it('is not shown to a member of a board that was not asked', async () => {
    state.actor = hal
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).not.toContain('Sent to your board for comment')
    expect(html).not.toContain(assignmentId)
  })
})

describe('the comment page', () => {
  it('shows the reviewers documents, not staff-only ones, and a comment box', async () => {
    state.actor = lee
    const html = renderToStaticMarkup(await open(assignmentId))
    expect(html).toContain('Sent to the Alder Pond Conservation Commission for comment.')
    expect(html).toContain('Comments by April 1, 2027.')
    expect(html).toContain(`/api/documents/${reviewersDoc}`)
    expect(html).toContain('Wetland delineation')
    expect(html).not.toContain(staffDoc)
    expect(html).not.toContain('Staff memo')
    expect(html).toContain('Post comment')
    expect(html).toContain('noindex')
    expect(html.replace(/<form[\s\S]*<\/form>/, '')).not.toMatch(/text-(xs|sm)\b/)
  })

  it('shows the comment with the member and board once posted, and the status moves', async () => {
    const posted = await addReviewComment(
      handle.db,
      lee,
      { assignmentId, body: 'Keep the 50 foot buffer.' },
      signal,
    )
    expect(posted.ok).toBe(true)
    state.actor = lee
    const html = renderToStaticMarkup(await open(assignmentId))
    expect(html).toContain('Keep the 50 foot buffer.')
    expect(html).toContain('Lee Marsh, Conservation Commission')
    expect(html).toContain('Comments received')
    const home = renderToStaticMarkup(await BoardHomePage())
    expect(home).toContain('Comments received')
  })

  it('is not found for a member of another board, a non-member and a bad id', async () => {
    state.actor = hal
    await expect(open(assignmentId)).rejects.toThrow('NEXT_NOT_FOUND')
    state.actor = world.applicant
    await expect(open(assignmentId)).rejects.toThrow('NEXT_NOT_FOUND')
    state.actor = lee
    await expect(open('not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(open(assignmentId)).rejects.toThrow(
      `NEXT_REDIRECT:/sign-in?next=%2Fboard%2Fcomments%2F${assignmentId}`,
    )
  })
})
