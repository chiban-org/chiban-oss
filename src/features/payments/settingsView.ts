import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import {
  getActiveProcessor,
  listProcessorAccounts,
  type ProcessorAccountSummary,
} from '@/features/payments/processorAccounts'
import { CLOVER_ADAPTER_STATUS } from '@/features/payments/processors/clover'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import { err, ok, type Result } from '@/types/result'

export interface ProcessorSettingsView {
  accounts: ProcessorAccountSummary[]
  active: 'ready' | 'not_configured' | 'unreadable'
  settings: PaymentSettingsBody
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
    settings: await getPaymentSettings(db, signal),
    cloverStatus: CLOVER_ADAPTER_STATUS,
  })
}
