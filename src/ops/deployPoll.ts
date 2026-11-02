import { z } from 'zod'
import { err, ok, type Result } from '@/types/result'

export const DEPLOY_POLL_DEFAULT_TIMEOUT_MS = 120_000
export const DEPLOY_POLL_DEFAULT_INTERVAL_MS = 2000

export interface DeployPollOptions {
  baseUrl: string
  expectImageRef: string
  timeoutMs: number
  intervalMs: number
}

export interface DeployPollDeps {
  fetch: typeof fetch
  sleep(ms: number): Promise<void>
  now(): number
}

export interface DeployPollHealthy {
  appVersion: string
  migrationHead: string
}

export interface DeployPollFailure {
  kind: 'timeout' | 'image_mismatch'
  lastSeen: string | null
}

const versionBody = z.object({
  appVersion: z.string(),
  imageRef: z.string().nullable(),
  migrationHead: z.string(),
})

type Probe = { healthy: false } | { healthy: true; body: z.infer<typeof versionBody> }

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

async function probe(baseUrl: string, deps: DeployPollDeps, signal: AbortSignal): Promise<Probe> {
  try {
    const health = await deps.fetch(`${baseUrl}/api/health`, { signal })
    if (health.status !== 200) return { healthy: false }
    const version = await deps.fetch(`${baseUrl}/api/version`, { signal })
    if (version.status !== 200) return { healthy: false }
    const parsed = versionBody.safeParse(await version.json())
    return parsed.success ? { healthy: true, body: parsed.data } : { healthy: false }
  } catch (e) {
    if (isAbort(e)) throw e
    return { healthy: false }
  }
}

export async function pollDeploy(
  opts: DeployPollOptions,
  deps: DeployPollDeps,
  signal: AbortSignal,
): Promise<Result<DeployPollHealthy, DeployPollFailure>> {
  const startedAt = deps.now()
  let lastSeen: string | null = null
  for (;;) {
    signal.throwIfAborted()
    const seen = await probe(opts.baseUrl, deps, signal)
    if (seen.healthy) {
      lastSeen = seen.body.imageRef
      if (seen.body.imageRef === opts.expectImageRef) {
        return ok({ appVersion: seen.body.appVersion, migrationHead: seen.body.migrationHead })
      }
    }
    if (deps.now() - startedAt >= opts.timeoutMs) {
      return err({ kind: lastSeen === null ? 'timeout' : 'image_mismatch', lastSeen })
    }
    await deps.sleep(opts.intervalMs)
  }
}
