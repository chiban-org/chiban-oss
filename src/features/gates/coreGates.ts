import { and, eq } from 'drizzle-orm'
import { applicationConditions } from '@/db/schema'
import { registerGate } from '@/features/gates/registry'

export const CONDITIONS_GATE_KEY = 'conditions.blocking_met'

registerGate({
  key: CONDITIONS_GATE_KEY,
  kind: 'administrative',
  appliesTo: ['issued'],
  boundBy: null,
  evaluate: async (tx, app) => {
    const unmet = await tx
      .select({ code: applicationConditions.code })
      .from(applicationConditions)
      .where(
        and(
          eq(applicationConditions.applicationId, app.id),
          eq(applicationConditions.blocksIssuance, true),
          eq(applicationConditions.status, 'unmet'),
        ),
      )
    if (unmet.length === 0) return { status: 'pass' }
    return {
      status: 'blocked',
      reason: `Unmet conditions block issuance: ${unmet.map((u) => u.code).join(', ')}.`,
    }
  },
})
