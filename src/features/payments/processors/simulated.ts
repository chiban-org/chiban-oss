import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { simulatedProcessorObjects } from '@/db/schema'
import type {
  PaymentProcessor,
  ProcessorPaymentState,
  ProcessorWebhookEvent,
} from '@/features/payments/processors/types'
import { err, ok } from '@/types/result'

export const SIMULATED_ACCOUNT_REF = 'sim_town'
export const SIMULATED_SIGNATURE_HEADER = 'x-simulated-signature'
const TOLERANCE_SECONDS = 300

type Refunds = ProcessorPaymentState['refunds']

export function signSimulatedPayload(secret: string, rawBody: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`
}

async function newObject(db: Db, amountCents: number): Promise<string> {
  const id = `sim_pi_${randomUUID()}`
  await db.insert(simulatedProcessorObjects).values({ id, amountCents })
  return id
}

export function createSimulatedProcessor(db: Db): PaymentProcessor {
  return {
    processor: 'simulated',
    verifyAccount: () => Promise.resolve(ok({ accountRef: SIMULATED_ACCOUNT_REF })),
    createOnlineCheckout: async (input) => {
      const objectId = await newObject(db, input.amountCents)
      return ok({ checkoutRef: objectId, redirectUrl: `/dev/checkout/${objectId}`, objectId })
    },
    resolveCheckout: (checkoutRef) => Promise.resolve(ok({ objectId: checkoutRef })),
    startCardPresent: async (input) => ok({ objectId: await newObject(db, input.amountCents) }),
    getPaymentState: async (objectId) => {
      const [row] = await db
        .select()
        .from(simulatedProcessorObjects)
        .where(eq(simulatedProcessorObjects.id, objectId))
      if (row === undefined) return err({ kind: 'not_found' as const })
      return ok({
        objectId: row.id,
        accountRef: SIMULATED_ACCOUNT_REF,
        status: row.status,
        amountCents: row.amountCents,
        settled: row.settled,
        refunds: row.refunds as Refunds,
        disputes: [],
      })
    },
    refund: async (input) => {
      const [row] = await db
        .select()
        .from(simulatedProcessorObjects)
        .where(eq(simulatedProcessorObjects.id, input.objectId))
      if (row === undefined) return err({ kind: 'rejected' as const, detail: 'Unknown object' })
      const refundObjectId = `sim_re_${randomUUID()}`
      const refunds = [
        ...(row.refunds as Refunds),
        { objectId: refundObjectId, amountCents: input.amountCents, status: 'succeeded' as const },
      ]
      await db
        .update(simulatedProcessorObjects)
        .set({ refunds })
        .where(eq(simulatedProcessorObjects.id, input.objectId))
      return ok({ refundObjectId })
    },
    cancelAuthorization: async (objectId) => {
      await db
        .update(simulatedProcessorObjects)
        .set({ status: 'canceled' })
        .where(eq(simulatedProcessorObjects.id, objectId))
      return ok(undefined)
    },
    verifyWebhook: ({ rawBody, headers, secret, now }) => {
      const parts = new Map(
        (headers.get(SIMULATED_SIGNATURE_HEADER) ?? '')
          .split(',')
          .map((p) => p.split('=') as [string, string]),
      )
      const t = Number(parts.get('t'))
      const given = Buffer.from(parts.get('v1') ?? '', 'hex')
      if (!Number.isFinite(t) || given.length === 0) return err('malformed' as const)
      const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest()
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return err('bad_signature' as const)
      }
      if (Math.abs(now.getTime() / 1000 - t) > TOLERANCE_SECONDS)
        return err('stale_timestamp' as const)
      try {
        const body = JSON.parse(rawBody) as Partial<ProcessorWebhookEvent>
        return ok({
          eventId: body.eventId ?? '',
          type: body.type ?? 'simulated.payment',
          objectId: body.objectId ?? null,
          checkoutRef: body.checkoutRef ?? null,
          accountRef: body.accountRef ?? null,
          livemode: false,
        })
      } catch {
        return err('malformed' as const)
      }
    },
  }
}
