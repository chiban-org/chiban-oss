import { desc, eq } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db, DbOrTx } from '@/db/client'
import { type ProcessorAccountRow, processorAccounts } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { HonestValue } from '@/features/honest/honest'
import type { Processor } from '@/features/ledger/types'
import { decryptSecret, encryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

export interface ProcessorAccountSummary {
  id: string
  processor: Processor
  mode: 'test' | 'live'
  accountRef: string
  settings: Record<string, unknown>
  isActive: boolean
  createdAt: Date
}

export interface SaveProcessorAccountInput {
  processor: Processor
  mode: 'test' | 'live'
  accountRef: string
  settings: Record<string, unknown>
  credentials: Record<string, unknown>
  webhookSecret: string
}

export interface ActiveProcessor {
  account: ProcessorAccountRow
  credentials: unknown
  webhookSecret: string
}

function summarize(row: ProcessorAccountRow): ProcessorAccountSummary {
  return {
    id: row.id,
    processor: row.processor,
    mode: row.mode,
    accountRef: row.accountRef,
    settings: row.settings as Record<string, unknown>,
    isActive: row.isActive,
    createdAt: row.createdAt,
  }
}

export async function saveProcessorAccount(
  db: Db,
  actor: Actor,
  input: SaveProcessorAccountInput,
  signal: AbortSignal,
  flags: { simulatedEnabled: boolean } = { simulatedEnabled: env.ENABLE_SIMULATED_PAYMENTS },
): Promise<
  Result<{ accountId: string }, 'forbidden' | 'simulated_disabled' | 'demo_simulated_only'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  if (env.CHIBAN_DEMO_MODE && input.processor !== 'simulated') return err('demo_simulated_only')
  if (input.processor === 'simulated' && !flags.simulatedEnabled) return err('simulated_disabled')
  return await transactionResult(db, async (tx) => {
    await tx
      .update(processorAccounts)
      .set({ isActive: false })
      .where(eq(processorAccounts.isActive, true))
    const [row] = await tx
      .insert(processorAccounts)
      .values({
        processor: input.processor,
        mode: input.mode,
        accountRef: input.accountRef,
        settings: input.settings,
        credentialsEnc: encryptSecret(JSON.stringify(input.credentials)),
        webhookSecretEnc: encryptSecret(input.webhookSecret),
        isActive: true,
        createdBy: actor.userId,
      })
      .returning({ id: processorAccounts.id })
    const accountId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'payments.processor_account.save',
        entityType: 'processor_account',
        entityId: accountId,
        after: { processor: input.processor, mode: input.mode, accountRef: input.accountRef },
      },
      signal,
    )
    return ok({ accountId })
  })
}

export async function listProcessorAccounts(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<ProcessorAccountSummary[]> {
  signal.throwIfAborted()
  const rows = await db.select().from(processorAccounts).orderBy(desc(processorAccounts.createdAt))
  return rows.map(summarize)
}

export function openAccount(account: ProcessorAccountRow): HonestValue<ActiveProcessor> {
  const credentials = decryptSecret(account.credentialsEnc)
  const webhookSecret = decryptSecret(account.webhookSecretEnc)
  if (!credentials.ok || !webhookSecret.ok) {
    return {
      state: 'import_failed',
      value: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
    }
  }
  return {
    state: 'known',
    value: {
      account,
      credentials: JSON.parse(credentials.value) as unknown,
      webhookSecret: webhookSecret.value,
    },
    asOf: account.createdAt.toISOString(),
  }
}

export async function getActiveProcessor(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<HonestValue<ActiveProcessor>> {
  signal.throwIfAborted()
  const [account] = await db
    .select()
    .from(processorAccounts)
    .where(eq(processorAccounts.isActive, true))
  if (account === undefined) return { state: 'not_applicable' }
  return openAccount(account)
}

export async function getProcessorAccount(
  db: DbOrTx,
  accountId: string,
  signal: AbortSignal,
): Promise<HonestValue<ActiveProcessor>> {
  signal.throwIfAborted()
  const [account] = await db
    .select()
    .from(processorAccounts)
    .where(eq(processorAccounts.id, accountId))
  if (account === undefined) return { state: 'not_applicable' }
  return openAccount(account)
}
