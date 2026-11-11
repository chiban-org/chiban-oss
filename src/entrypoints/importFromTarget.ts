import { db, pool } from '@/db/client'
import { parseImportFromTargetArgs } from '@/features/backup/cliArgs'
import { importFromTarget } from '@/features/export/importFromTarget'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { getObjectStore } from '@/features/storage/objectStore'

const TIMEOUT_MS = 6 * 60 * 60 * 1000

const args = parseImportFromTargetArgs(process.argv.slice(2))
if (!args.ok) {
  process.stderr.write(`${args.error}\n`)
  process.exit(2)
}
const result = await importFromTarget(
  db,
  getObjectStore(),
  createLocalFsTarget({ root: args.value.dir }),
  args.value.month,
  AbortSignal.timeout(TIMEOUT_MS),
)
await pool.end()
if (!result.ok) {
  process.stderr.write(`import refused: ${JSON.stringify(result.error)}\n`)
  process.exit(1)
}
process.stdout.write(`imported export ${result.value.exportId}: ${result.value.files} files\n`)
