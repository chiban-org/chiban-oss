import { db, pool } from '@/db/client'
import { seedDemo } from '@/features/demo/seedDemo'

const report = await seedDemo(db, AbortSignal.timeout(60_000))
await pool.end()
console.warn(
  `demo seed complete: ${report.usersCreated} users created, ${report.rolesAssigned} roles assigned, parcels ${report.parcelsSeeded ? 'seeded' : 'already present'}, permits ${report.permitsSeeded ? 'seeded' : 'already present'}`,
)
