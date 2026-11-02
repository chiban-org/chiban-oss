import { describe, expect, it, vi } from 'vitest'
import type { DbOrTx } from '@/db/client'

vi.mock('@/db/migrationHead', () => ({
  getMigrationHead: () => Promise.resolve('0001_head'),
}))

const { versionResponse } = await import('@/features/health/version')

const fakeDb = {} as DbOrTx
const signal = new AbortController().signal

describe('versionResponse imageRef', () => {
  it('carries the image ref it is given', async () => {
    const response = await versionResponse(fakeDb, signal, 'registry.example/chiban@sha256:abc')
    const body = (await response.json()) as Record<string, unknown>
    expect(body.imageRef).toBe('registry.example/chiban@sha256:abc')
    expect(body.migrationHead).toBe('0001_head')
  })

  it('reports null when no image ref is configured', async () => {
    const response = await versionResponse(fakeDb, signal, null)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.imageRef).toBeNull()
  })
})
