import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { saveDraft } from '@/features/config/store'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

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
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: SettingsKeyPage } = await import('./page')

const signal = new AbortController().signal
const KEY = 'town.bp.validity'
const BUTTON = />Use the starting value again<\/button>/
let handle: TestDb
let admin: Actor

async function render(): Promise<string> {
  return renderToStaticMarkup(
    await SettingsKeyPage({ params: Promise.resolve({ kind: 'town_rule_setting', key: KEY }) }),
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  state.actor = admin
})
afterAll(async () => {
  await handle.drop()
})

describe('use the starting value again', () => {
  it('is not offered while the town has no value in use', async () => {
    await saveDraft(
      handle.db,
      admin,
      { kind: 'town_rule_setting', key: KEY, body: { ruleKey: KEY, value: 18 } },
      signal,
    )
    expect(await render()).not.toMatch(BUTTON)
  })

  it('is offered once a value is in use', async () => {
    await saveAndPublish(handle.db, admin, 'town_rule_setting', KEY, {
      ruleKey: KEY,
      value: 18,
      adoptingAuthority: 'Town Meeting',
      adoptedOn: '2027-03-10',
    })
    expect(await render()).toMatch(BUTTON)
  })
})
