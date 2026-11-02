import { parseArgs } from 'node:util'
import { eq } from 'drizzle-orm'
import { db, pool } from '@/db/client'
import { users } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { attachCutoverFolder } from '@/features/cutover/attachFolder'
import { getObjectStore } from '@/features/storage/objectStore'

const { values } = parseArgs({ options: { dir: { type: 'string' }, as: { type: 'string' } } })
if (values.dir === undefined || values.as === undefined) {
  process.stderr.write('usage: cutover-attach --dir <path> --as <staff email>\n')
  process.exit(2)
}
const signal = AbortSignal.timeout(6 * 60 * 60 * 1000)
const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, values.as))
const actor = user === undefined ? null : await loadActor(db, user.id, signal)
if (actor === null) {
  process.stderr.write('no active staff user with that email\n')
  process.exit(2)
}
const result = await attachCutoverFolder(db, getObjectStore(), actor, { root: values.dir }, signal)
await pool.end()
if (!result.ok) {
  process.stderr.write('that user may not import applications\n')
  process.exit(1)
}
process.stdout.write(
  `attached ${result.value.attached}, reused ${result.value.deduplicated} stored files, unmatched folders: ${result.value.unmatchedFolders.join(', ') || 'none'}\n`,
)
