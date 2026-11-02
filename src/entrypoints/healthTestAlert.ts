import { db, pool } from '@/db/client'
import { configuredChannels } from '@/features/health/channels/configured'
import { sendSyntheticAlert } from '@/features/health/syntheticAlert'

const TIMEOUT_MS = 60_000

const channels = configuredChannels()
if (channels.length === 0) {
  process.stderr.write('no alert channel is configured: set ALERT_EMAIL_TO or PAGER_ROUTING_KEY\n')
  await pool.end()
  process.exit(2)
}
const results = await sendSyntheticAlert(db, channels, AbortSignal.timeout(TIMEOUT_MS), {
  now: new Date(),
  createdByKind: 'cli',
})
await pool.end()
for (const r of results) {
  process.stdout.write(`${r.channel}: ${r.sent ? 'sent, open the link to confirm' : 'failed'}\n`)
}
process.exit(results.every((r) => r.sent) ? 0 : 1)
