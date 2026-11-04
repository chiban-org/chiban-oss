import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: BoardsLayout } = await import('@/app/(staff)/staff/boards/layout')

let handle: TestDb
let member: Actor
let staff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  member = await staffActor(handle.db, 'board_member')
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

describe('board staff pages', () => {
  it('send a board member to their own board page', async () => {
    state.actor = member
    await expect(BoardsLayout({ children: 'page' })).rejects.toThrow('NEXT_REDIRECT:/board')
  })

  it('open for staff who keep the board records', async () => {
    state.actor = staff
    const page = await BoardsLayout({ children: 'page' })
    expect(page.props).toEqual({ children: 'page' })
  })
})
