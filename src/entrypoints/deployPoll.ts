import { parseArgs } from 'node:util'
import { z } from 'zod'
import {
  DEPLOY_POLL_DEFAULT_INTERVAL_MS,
  DEPLOY_POLL_DEFAULT_TIMEOUT_MS,
  pollDeploy,
} from '@/ops/deployPoll'

const argsSchema = z.object({
  url: z.url(),
  'expect-image': z.string().min(1),
  'timeout-ms': z.coerce.number().int().positive().default(DEPLOY_POLL_DEFAULT_TIMEOUT_MS),
  'interval-ms': z.coerce.number().int().positive().default(DEPLOY_POLL_DEFAULT_INTERVAL_MS),
})

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    'expect-image': { type: 'string' },
    'timeout-ms': { type: 'string' },
    'interval-ms': { type: 'string' },
  },
})
const args = argsSchema.safeParse(values)
if (!args.success) {
  process.stderr.write(
    'usage: deploy-poll --url http://app:3000 --expect-image REF [--timeout-ms N] [--interval-ms N]\n',
  )
  process.exit(2)
}

const timeoutMs = args.data['timeout-ms']
const result = await pollDeploy(
  {
    baseUrl: args.data.url.replace(/\/$/, ''),
    expectImageRef: args.data['expect-image'],
    timeoutMs,
    intervalMs: args.data['interval-ms'],
  },
  {
    fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  },
  AbortSignal.timeout(timeoutMs + 30_000),
)

if (result.ok) {
  process.stdout.write(`serving ${args.data['expect-image']} (${result.value.appVersion})\n`)
  process.exit(0)
}
process.stderr.write(
  `deploy not healthy: ${result.error.kind}, last image seen: ${result.error.lastSeen ?? 'none'}\n`,
)
process.exit(1)
