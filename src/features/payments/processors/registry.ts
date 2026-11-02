import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import type { ProcessorAccountRow } from '@/db/schema'
import {
  CloverCredentialsSchema,
  createCloverProcessor,
} from '@/features/payments/processors/clover'
import { createSimulatedProcessor } from '@/features/payments/processors/simulated'
import {
  createStripeProcessor,
  StripeCredentialsSchema,
} from '@/features/payments/processors/stripe'
import type { PaymentProcessor } from '@/features/payments/processors/types'

export interface ProcessorDeps {
  fetch: typeof fetch
  db: DbOrTx
  stripeApiBase?: string
  cardPresentTimeoutMs?: number
}

function malformed(account: ProcessorAccountRow): AppError {
  return new AppError(ErrorIds.CFG_SCHEMA_FAIL, 'Stored processor credentials are malformed', {
    accountId: account.id,
    processor: account.processor,
  })
}

export function createProcessor(
  account: ProcessorAccountRow,
  credentials: unknown,
  deps: ProcessorDeps,
): PaymentProcessor {
  switch (account.processor) {
    case 'stripe': {
      const parsed = StripeCredentialsSchema.safeParse(credentials)
      if (!parsed.success) throw malformed(account)
      return createStripeProcessor(parsed.data, account, {
        fetch: deps.fetch,
        apiBase: deps.stripeApiBase ?? env.STRIPE_API_BASE,
      })
    }
    case 'clover': {
      const parsed = CloverCredentialsSchema.safeParse(credentials)
      if (!parsed.success) throw malformed(account)
      return createCloverProcessor(parsed.data, account, {
        fetch: deps.fetch,
        cardPresentTimeoutMs: deps.cardPresentTimeoutMs,
      })
    }
    case 'simulated':
      return createSimulatedProcessor(deps.db)
    default:
      throw new AppError(ErrorIds.PAY_UNKNOWN_PROCESSOR, 'No adapter for this processor', {
        processor: account.processor,
      })
  }
}
