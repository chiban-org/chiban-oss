import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { calendarAccounts } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { encryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

export interface CalendarAccountInput {
  tenantId: string
  clientId: string
  clientSecret: string
  authorityBase?: string
  graphBase?: string
}

export async function saveCalendarAccount(
  db: Db,
  actor: Actor,
  input: CalendarAccountInput,
  signal: AbortSignal,
): Promise<Result<{ accountId: string }, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx
      .update(calendarAccounts)
      .set({ isActive: false })
      .where(eq(calendarAccounts.isActive, true))
    const [row] = await tx
      .insert(calendarAccounts)
      .values({
        kind: 'graph',
        tenantId: input.tenantId,
        clientId: input.clientId,
        clientSecretEnc: encryptSecret(input.clientSecret),
        ...(input.authorityBase === undefined ? {} : { authorityBase: input.authorityBase }),
        ...(input.graphBase === undefined ? {} : { graphBase: input.graphBase }),
        createdBy: actor.userId,
      })
      .returning({ id: calendarAccounts.id })
    const accountId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'calendar_account.save',
        entityType: 'calendar_account',
        entityId: accountId,
        after: { tenantId: input.tenantId, clientId: input.clientId },
      },
      signal,
    )
    return ok({ accountId })
  })
}
