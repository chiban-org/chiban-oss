import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { anonymousIntakeVerifications } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
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
}))
vi.mock('./actions', () => ({
  enableAnonymousIntakeAction: () => Promise.resolve({ ok: true, message: '' }),
  disableAnonymousIntakeAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: AnonymousIntakePage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await staffActor(handle.db, 'admin')
})
afterAll(async () => {
  await handle.drop()
})

async function page(): Promise<string> {
  return renderToStaticMarkup(await AnonymousIntakePage())
}

describe('anonymous intake page', () => {
  it('offers no turn-on button until the running version has a passing check, and says why once', async () => {
    const html = await page()
    expect(html).not.toContain('Turn anonymous intake on')
    expect(html).toContain('verify-anonymous-intake.sh')
    expect(html.match(/passing retention check/g)?.length).toBe(1)
  })

  it('offers the turn-on button once the running version has passed', async () => {
    await handle.db.insert(anonymousIntakeVerifications).values({
      imageRef: env.CHIBAN_IMAGE_REF ?? null,
      appVersion: APP_VERSION,
      caddyfileSha256: 'x',
      passed: true,
      findings: [],
    })
    expect(await page()).toContain('Turn anonymous intake on')
  })
})
