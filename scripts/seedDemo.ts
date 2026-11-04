import { db, pool } from '@/db/client'
import { seedDemo } from '@/features/demo/seedDemo'

const SEEDED = 'seeded'
const PRESENT = 'already present'
const report = await seedDemo(db, AbortSignal.timeout(180_000), { screenStates: true })
await pool.end()
console.warn(
  `demo seed complete: ${report.usersCreated} users created, ${report.rolesAssigned} roles assigned, parcels ${report.parcelsSeeded ? SEEDED : PRESENT}, permits ${report.permitsSeeded ? SEEDED : PRESENT}, payments ${report.paymentsSeeded ? SEEDED : PRESENT}, records ${report.recordsSeeded ? SEEDED : PRESENT}, inspections ${report.inspectionsSeeded ? SEEDED : PRESENT}, exit and operations ${report.operationsSeeded ? SEEDED : PRESENT}, screen states ${report.coverageSeeded ? 'added' : PRESENT}`,
)
