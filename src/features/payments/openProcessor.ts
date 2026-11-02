import type { Db } from '@/db/client'
import type { ProcessorAccountRow } from '@/db/schema'
import { getProcessorAccount } from '@/features/payments/processorAccounts'
import { createProcessor } from '@/features/payments/processors/registry'
import type { PaymentProcessor, ProcessorError } from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

export interface ProcessorFactoryDeps {
  processorFactory?: (account: ProcessorAccountRow, credentials: unknown) => PaymentProcessor
}

export async function openProcessor(
  db: Db,
  accountId: string,
  deps: ProcessorFactoryDeps,
  signal: AbortSignal,
): Promise<Result<{ processor: PaymentProcessor; account: ProcessorAccountRow }, ProcessorError>> {
  const opened = await getProcessorAccount(db, accountId, signal)
  if (opened.state !== 'known') {
    return err({ kind: 'rejected', detail: 'Processor credentials cannot be read' })
  }
  const { account, credentials } = opened.value
  const processor = deps.processorFactory
    ? deps.processorFactory(account, credentials)
    : createProcessor(account, credentials, { fetch, db })
  return ok({ processor, account })
}
