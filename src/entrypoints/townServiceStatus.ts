import { parseArgs } from 'node:util'
import { eq } from 'drizzle-orm'
import { db, pool } from '@/db/client'
import { townSettings } from '@/db/schema'
import { SERVICE_STATUSES } from '@/db/schema/town'
import { parseCivilDate } from '@/types/civilDate'

const { values } = parseArgs({
  options: { status: { type: 'string' }, since: { type: 'string' }, window: { type: 'string' } },
})
const status = SERVICE_STATUSES.find((s) => s === values.status)
if (status === undefined) {
  process.stderr.write(
    'usage: town-service-status --status active|suspended|terminated [--since YYYY-MM-DD] [--window DAYS]\n',
  )
  process.exit(2)
}
const since = values.since === undefined ? null : parseCivilDate(values.since)
if (since !== null && !since.ok) {
  process.stderr.write('--since must be a date such as 2027-09-30\n')
  process.exit(2)
}
await db
  .update(townSettings)
  .set({
    serviceStatus: status,
    serviceStatusSince: status === 'active' || since === null ? null : since.value,
    ...(values.window === undefined ? {} : { exportWindowDays: Number(values.window) }),
  })
  .where(eq(townSettings.id, 1))
await pool.end()
process.stdout.write(`service status is now ${status}\n`)
