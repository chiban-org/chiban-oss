import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import { db, pool } from '@/db/client'
import { exportTargets } from '@/db/schema'
import { BACKUP_USAGE, parseBackupArgs } from '@/features/backup/cliArgs'
import { createBackup } from '@/features/backup/createBackup'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { buildTarget } from '@/features/export/targets/manageTargets'
import type { StorageTarget } from '@/features/export/targets/types'
import { getObjectStore } from '@/features/storage/objectStore'

const TIMEOUT_MS = 6 * 60 * 60 * 1000

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

async function targetFor(args: ReturnType<typeof parseBackupArgs>): Promise<StorageTarget> {
  if (!args.ok) return fail(BACKUP_USAGE, 2)
  if (args.value.kind === 'dir') return createLocalFsTarget({ root: args.value.dir })
  const [row] = await db
    .select()
    .from(exportTargets)
    .where(eq(exportTargets.name, args.value.name))
    .limit(1)
  if (row === undefined) return fail(`no export target is named "${args.value.name}"`, 2)
  const built = buildTarget(row, { fetch, now: () => new Date() })
  if (!built.ok) return fail(`the export target is not usable: ${built.error}`, 2)
  return built.value
}

const args = parseBackupArgs(process.argv.slice(2))
if (env.BACKUP_PASSPHRASE === undefined) {
  fail('BACKUP_PASSPHRASE must be set to a passphrase of at least 16 characters', 2)
}
const target = await targetFor(args)
const result = await createBackup(
  {
    db,
    pgDumpPath: env.PG_DUMP_PATH,
    databaseUrl: env.DATABASE_URL,
    store: getObjectStore(),
    secretKeys: env.CHIBAN_SECRET_KEYS,
    activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
    passphrase: env.BACKUP_PASSPHRASE,
    target,
    now: new Date(),
  },
  AbortSignal.timeout(TIMEOUT_MS),
)
await pool.end()
if (!result.ok) {
  fail(`backup failed: ${JSON.stringify(result.error)}`, 1)
}
process.stderr.write(`${result.value.objects} objects, ${result.value.sizeBytes} bytes\n`)
process.stdout.write(`wrote ${result.value.path}\n`)
