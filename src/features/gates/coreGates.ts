import { and, eq } from 'drizzle-orm'
import { applicationConditions } from '@/db/schema'
import { registerGate } from '@/features/gates/registry'

export const CONDITIONS_GATE_KEY = 'conditions.blocking_met'

registerGate({
  key: CONDITIONS_GATE_KEY,
  label: 'Blocking conditions met',
  kind: 'administrative',
  appliesTo: ['issued'],
  boundBy: null,
  evaluate: async (tx, app) => {
    const unmet = await tx
      .select({ text: applicationConditions.textSnapshot })
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
      reason: `Unmet conditions block issuance: ${unmet.map((u) => u.text).join('; ')}.`,
    }
  },
})
