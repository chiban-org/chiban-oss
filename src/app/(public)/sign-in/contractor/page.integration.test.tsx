import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeTestDb, type TestDb } from '@/test/db'

const state = vi.hoisted((): { db: unknown } => ({ db: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))

const { default: ContractorSignUpPage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
})
afterAll(async () => {
  await handle.drop()
})

describe('contractor sign-up page', () => {
  it('says plainly that a new account is created and offers sign-in to a returning contractor', async () => {
    const html = renderToStaticMarkup(await ContractorSignUpPage())
    expect(html).toContain('creates a new account')
    expect(html).not.toContain('If that address')
    expect(html).toContain('Already have an account? ')
    expect(html).toContain('href="/sign-in?next=%2Fportal%2Fcontractor"')
  })
})
