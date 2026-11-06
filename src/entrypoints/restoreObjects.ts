import { parseRestoreObjectsArgs, RESTORE_OBJECTS_USAGE } from '@/features/backup/cliArgs'
import { restoreObjectsFromDir } from '@/features/backup/restoreObjects'
import { getObjectStore } from '@/features/storage/objectStore'

const TIMEOUT_MS = 6 * 60 * 60 * 1000

const args = parseRestoreObjectsArgs(process.argv.slice(2))
if (!args.ok) {
  process.stderr.write(`${RESTORE_OBJECTS_USAGE}\n`)
  process.exit(2)
}
const store = getObjectStore()
if (!(await store.bucketExists(AbortSignal.timeout(30_000)))) {
  process.stderr.write(`bucket ${store.bucket} does not exist; run the storage init step first\n`)
  process.exit(1)
}
const uploaded = await restoreObjectsFromDir(store, args.value.dir, AbortSignal.timeout(TIMEOUT_MS))
process.stdout.write(`restored ${uploaded} objects into ${store.bucket}\n`)
