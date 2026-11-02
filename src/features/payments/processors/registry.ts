import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { ProcessorAccountRow } from '@/db/schema'
import {
  CloverCredentialsSchema,
  createCloverProcessor,
} from '@/features/payments/processors/clover'
import {
  createStripeProcessor,
  StripeCredentialsSchema,
} from '@/features/payments/processors/stripe'
import type { PaymentProcessor } from '@/features/payments/processors/types'

export interface ProcessorDeps {
  fetch: typeof fetch
  db: Db
  stripeApiBase?: string
  cardPresentTimeoutMs?: number
}

export function createProcessor(
  account: ProcessorAccountRow,
  credentials: unknown,
  deps: ProcessorDeps,
): PaymentProcessor {
  if (account.processor === 'stripe') {
    const parsed = StripeCredentialsSchema.safeParse(credentials)
    if (!parsed.success) {
      throw new AppError(ErrorIds.CFG_SCHEMA_FAIL, 'Stored Stripe credentials are malformed', {
        accountId: account.id,
      })
    }
    return createStripeProcessor(parsed.data, account, {
      fetch: deps.fetch,
      apiBase: deps.stripeApiBase ?? env.STRIPE_API_BASE,
    })
  }
  if (account.processor === 'clover') {
    const parsed = CloverCredentialsSchema.safeParse(credentials)
    if (!parsed.success) {
      throw new AppError(ErrorIds.CFG_SCHEMA_FAIL, 'Stored Clover credentials are malformed', {
        accountId: account.id,
      })
    }
    return createCloverProcessor(parsed.data, account, {
      fetch: deps.fetch,
      cardPresentTimeoutMs: deps.cardPresentTimeoutMs,
    })
  }
  throw new AppError(ErrorIds.PAY_UNKNOWN_PROCESSOR, 'No adapter for this processor', {
    processor: account.processor,
  })
}
