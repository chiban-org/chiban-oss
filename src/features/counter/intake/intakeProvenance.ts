import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { counterIntakes, users } from '@/db/schema'

export async function counterIntakeLine(db: DbOrTx, applicationId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: users.displayName })
    .from(counterIntakes)
    .leftJoin(users, eq(users.id, counterIntakes.takenBy))
    .where(eq(counterIntakes.applicationId, applicationId))
  if (row === undefined) return null
  return `Taken at the counter by ${row.name ?? 'a former user'}`
}
