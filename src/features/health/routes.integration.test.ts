import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations } from '@/db/migrate'
import { healthResponse } from '@/features/health/health'
import { versionResponse } from '@/features/health/version'
import { makeEmptyDb, makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
const signal = new AbortController().signal

interface Journal {
  entries: { tag: string }[]
}

function lastJournalTag(): string {
  const journal = JSON.parse(
    readFileSync(new URL('../../../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
  ) as Journal
  return journal.entries.at(-1)?.tag ?? ''
}

beforeAll(async () => {
  handle = await makeEmptyDb()
  await applyMigrations(handle.db, signal)
})
afterAll(async () => {
  await handle.drop()
})

describe('/api/version', () => {
  it('reports app version, pack identity, and the applied migration head', async () => {
    const response = await versionResponse(handle.db, signal)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({
      appVersion: expect.any(String),
      pack: { id: 'nh', version: '0.1.0', hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      migrationHead: lastJournalTag(),
    })
  })

  it('answers 503 when the database cannot be queried', async () => {
    const dead = await makeTestDb()
    await dead.drop()
    const response = await versionResponse(dead.db, signal)
    expect(response.status).toBe(503)
  })
})

describe('/api/health', () => {
  it('answers 200 when the database responds', async () => {
    const response = await healthResponse(handle.db, signal)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('answers 503 when the database query fails', async () => {
    const dead = await makeTestDb()
    await dead.drop()
    const response = await healthResponse(dead.db, signal)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable' })
  })
})
