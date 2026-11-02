import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { ProcessorAccountRow } from '@/db/schema'
import type { PaymentProcessor } from '@/features/payments/processors/types'

export interface ProcessorDeps {
  fetch: typeof fetch
  db: Db
}

export function createProcessor(
  account: ProcessorAccountRow,
  _credentials: unknown,
  _deps: ProcessorDeps,
): PaymentProcessor {
  throw new AppError(ErrorIds.PAY_UNKNOWN_PROCESSOR, 'No adapter for this processor', {
    processor: account.processor,
  })
}
