import { createReadStream } from 'node:fs'
import { env } from '@/config/env'
import { db, pool } from '@/db/client'
import { parseVerifyArgs, VERIFY_USAGE } from '@/features/backup/cliArgs'
import { restoreVerify } from '@/features/backup/restoreVerify'
import { createObjectStore, objectStoreConfigFromEnv } from '@/features/storage/objectStore'

const TIMEOUT_MS = 6 * 60 * 60 * 1000

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

const args = parseVerifyArgs(process.argv.slice(2))
if (!args.ok) fail(VERIFY_USAGE, 2)
if (env.BACKUP_PASSPHRASE === undefined) {
  fail('BACKUP_PASSPHRASE must be set to the passphrase the backup was made with', 2)
}
const adminUrl = new URL(env.DATABASE_URL)
adminUrl.pathname = '/postgres'
const result = await restoreVerify(
  {
    pgRestorePath: env.PG_RESTORE_PATH,
    sourceDb: db,
    adminDatabaseUrl: adminUrl.toString(),
    passphrase: env.BACKUP_PASSPHRASE,
    backupBytes: createReadStream(args.value.file),
    scratchStore: (bucket) => createObjectStore({ ...objectStoreConfigFromEnv(), bucket }),
    keep: args.value.keep,
  },
  AbortSignal.timeout(TIMEOUT_MS),
)
await pool.end()
if (!result.ok) {
  fail(`verification failed: ${result.error}`, 1)
}
process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`)
process.exit(result.value.ok ? 0 : 1)
