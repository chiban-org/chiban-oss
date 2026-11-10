import { db, pool } from '@/db/client'
import { demoSeedDirs, resetDemoDatabase } from '@/features/demo/demoReset'

const RESET_TIMEOUT_MS = 15 * 60 * 1000

const result = await resetDemoDatabase(db, AbortSignal.timeout(RESET_TIMEOUT_MS), {
  operations: demoSeedDirs(),
})
await pool.end()
if (!result.ok) {
  console.error(
    result.error === 'not_allowed'
      ? 'refusing to reset: this runs only with CHIBAN_DEMO_MODE=true, or on a development database with ENABLE_DEV_SIGN_IN=true'
      : 'demo reset failed while migrating',
  )
  process.exit(1)
}
console.warn(
  `demo reset complete: ${result.value.usersCreated} users, ${result.value.rolesAssigned} roles`,
)
process.exit(0)
