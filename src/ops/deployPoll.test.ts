import { describe, expect, it } from 'vitest'
import { pollDeploy } from '@/ops/deployPoll'

const signal = new AbortController().signal
const EXPECTED = 'registry.example/chiban@sha256:aaa'
const OPTS = {
  baseUrl: 'http://app:3000',
  expectImageRef: EXPECTED,
  timeoutMs: 10_000,
  intervalMs: 1000,
}

interface Step {
  health: number | 'down'
  version?: { status: number; imageRef: string | null }
}

function scripted(steps: Step[]) {
  let clock = 0
  let index = 0
  const urls: string[] = []
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    urls.push(url)
    const step = steps[Math.min(index, steps.length - 1)]
    if (step === undefined) return Promise.reject(new Error('no steps'))
    if (url.endsWith('/api/health')) {
      if (step.health === 'down') return Promise.reject(new TypeError('fetch failed'))
      return Promise.resolve(new Response('{}', { status: step.health }))
    }
    const v = step.version ?? { status: 503, imageRef: null }
    return Promise.resolve(
      Response.json(
        { appVersion: '1.2.3', imageRef: v.imageRef, pack: {}, migrationHead: '0042_head' },
        { status: v.status },
      ),
    )
  }
  return {
    urls,
    deps: {
      fetch: fetchFn,
      sleep: (ms: number) => {
        clock += ms
        index += 1
        return Promise.resolve()
      },
      now: () => clock,
    },
  }
}

describe('pollDeploy', () => {
  it('returns ok when health and version match', async () => {
    const { deps } = scripted([{ health: 200, version: { status: 200, imageRef: EXPECTED } }])
    const result = await pollDeploy(OPTS, deps, signal)
    expect(result).toEqual({ ok: true, value: { appVersion: '1.2.3', migrationHead: '0042_head' } })
  })

  it('retries until health answers 200', async () => {
    const { deps, urls } = scripted([
      { health: 'down' },
      { health: 503 },
      { health: 200, version: { status: 200, imageRef: EXPECTED } },
    ])
    const result = await pollDeploy(OPTS, deps, signal)
    expect(result.ok).toBe(true)
    expect(urls.filter((u) => u.endsWith('/api/health'))).toHaveLength(3)
  })

  it('returns image_mismatch with the last seen ref at timeout', async () => {
    const old = 'registry.example/chiban@sha256:bbb'
    const { deps } = scripted([{ health: 200, version: { status: 200, imageRef: old } }])
    const result = await pollDeploy({ ...OPTS, timeoutMs: 3000 }, deps, signal)
    expect(result).toEqual({ ok: false, error: { kind: 'image_mismatch', lastSeen: old } })
  })

  it('returns timeout with no last seen ref when nothing ever answers', async () => {
    const { deps } = scripted([{ health: 'down' }])
    const result = await pollDeploy({ ...OPTS, timeoutMs: 3000 }, deps, signal)
    expect(result).toEqual({ ok: false, error: { kind: 'timeout', lastSeen: null } })
  })

  it('treats a version body with a null image ref as not yet matching', async () => {
    const { deps } = scripted([{ health: 200, version: { status: 200, imageRef: null } }])
    const result = await pollDeploy({ ...OPTS, timeoutMs: 2000 }, deps, signal)
    expect(result.ok).toBe(false)
  })

  it('rethrows an abort instead of retrying', async () => {
    const controller = new AbortController()
    controller.abort()
    const { deps } = scripted([{ health: 200, version: { status: 200, imageRef: EXPECTED } }])
    const aborting: typeof fetch = () => Promise.reject(new DOMException('aborted', 'AbortError'))
    await expect(
      pollDeploy(OPTS, { ...deps, fetch: aborting }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
