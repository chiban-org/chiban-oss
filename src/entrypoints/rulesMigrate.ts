import { db, pool } from '@/db/client'
import { rulesMigrateMain } from '@/features/packs/rulesMigrateCli'

const code = await rulesMigrateMain(db, process.argv.slice(2))
await pool.end()
process.exit(code)
