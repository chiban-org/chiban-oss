import { env } from '@/config/env'
import { db, pool } from '@/db/client'
import { type DemoResetError, demoSeedDirs, resetDemoDatabase } from '@/features/demo/demoReset'
import { prepareDemoOverlay } from '@/features/demo/overlay/overlayFromEnv'

const RESET_TIMEOUT_MS = 15 * 60 * 1000

function failureText(error: DemoResetError): string {
  if (error === 'not_allowed') {
    return 'refusing to reset: this runs only with CHIBAN_DEMO_MODE=true, or on a development database with ENABLE_DEV_SIGN_IN=true'
  }
  if (error === 'migration_failed') return 'demo reset failed while migrating'
  return `demo reset failed while applying the overlay: ${error.overlay}`
}

const overlay = await prepareDemoOverlay({
  file: env.CHIBAN_DEMO_OVERLAY_FILE,
  demoMode: env.CHIBAN_DEMO_MODE,
  report: (line) => console.warn(line),
})
if (!overlay.ok) {
  console.error(`${overlay.error}\nthe database was not touched`)
  await pool.end()
  process.exit(1)
}

const result = await resetDemoDatabase(db, AbortSignal.timeout(RESET_TIMEOUT_MS), {
  operations: demoSeedDirs(),
  overlay: overlay.value,
})
await pool.end()
if (!result.ok) {
  console.error(failureText(result.error))
  process.exit(1)
}
const applied = result.value.overlay
if (applied !== null) {
  console.warn(`demo overlay applied: ${applied.changedTypes.length} application types changed`)
}
console.warn(
  `demo reset complete: ${result.value.usersCreated} users, ${result.value.rolesAssigned} roles`,
)
process.exit(0)
