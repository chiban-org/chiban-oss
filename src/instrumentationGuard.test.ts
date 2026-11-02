import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANONYMOUS_PREFIXES } from '@/constants/anonymousRoutes'

const FILE = fileURLToPath(new URL('./instrumentation.ts', import.meta.url))

describe('instrumentation', () => {
  it('no instrumentation onRequestError captures anonymous requests', async () => {
    if (!existsSync(FILE)) return
    const mod = (await import(/* @vite-ignore */ FILE)) as {
      onRequestError?: (error: unknown, request: { path: string; method: string }) => unknown
    }
    const sink: unknown[] = []
    const original = globalThis.fetch
    globalThis.fetch = (...args: Parameters<typeof fetch>) => {
      sink.push(args)
      return Promise.resolve(new Response(null))
    }
    try {
      for (const prefix of ANONYMOUS_PREFIXES) {
        await mod.onRequestError?.(new Error('boom'), { path: prefix, method: 'POST' })
      }
    } finally {
      globalThis.fetch = original
    }
    expect(sink).toEqual([])
  })
})
