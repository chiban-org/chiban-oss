import { and, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { calendarAccounts } from '@/db/schema'
import { createGraphPublisher } from '@/features/calendar/graphPublisher'
import type { TokenDeps } from '@/features/calendar/graphToken'
import type { CalendarError, CalendarPublisher } from '@/features/calendar/publisher'
import { decryptSecret } from '@/server/secrets'
import { err, type Result } from '@/types/result'

async function connected(
  db: DbOrTx,
  deps: TokenDeps,
): Promise<Result<CalendarPublisher, CalendarError>> {
  const [account] = await db
    .select()
    .from(calendarAccounts)
    .where(and(eq(calendarAccounts.kind, 'graph'), eq(calendarAccounts.isActive, true)))
    .orderBy(desc(calendarAccounts.createdAt))
    .limit(1)
  if (account === undefined) {
    return err({ kind: 'auth_failed', detail: 'no Microsoft tenant is connected' })
  }
  const secret = decryptSecret(account.clientSecretEnc)
  if (!secret.ok)
    return err({ kind: 'auth_failed', detail: 'the stored client secret cannot be read' })
  return { ok: true, value: createGraphPublisher(account, secret.value, deps) }
}

export function createLazyGraphPublisher(db: DbOrTx, deps: TokenDeps): CalendarPublisher {
  return {
    kind: 'graph',
    async publish(booking, previousRef, signal) {
      const publisher = await connected(db, deps)
      return publisher.ok ? await publisher.value.publish(booking, previousRef, signal) : publisher
    },
    async cancel(booking, externalRef, signal) {
      const publisher = await connected(db, deps)
      return publisher.ok ? await publisher.value.cancel(booking, externalRef, signal) : publisher
    },
  }
}
