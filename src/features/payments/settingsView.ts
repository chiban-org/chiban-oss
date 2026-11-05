import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  getActiveProcessor,
  listProcessorAccounts,
  type ProcessorAccountSummary,
} from '@/features/payments/processorAccounts'
import { CLOVER_ADAPTER_STATUS } from '@/features/payments/processors/clover'
import { err, ok, type Result } from '@/types/result'

export interface ProcessorSettingsView {
  accounts: ProcessorAccountSummary[]
  active: 'ready' | 'not_configured' | 'unreadable'
  cloverStatus: 'stubbed' | 'verified'
}

export async function loadProcessorSettings(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<ProcessorSettingsView, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  const active = await getActiveProcessor(db, signal)
  return ok({
    accounts: await listProcessorAccounts(db, signal),
    active:
      active.state === 'known'
        ? 'ready'
        : active.state === 'not_applicable'
          ? 'not_configured'
          : 'unreadable',
    cloverStatus: CLOVER_ADAPTER_STATUS,
  })
}
