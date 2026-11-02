import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applicationConditions, certificatesOfOccupancy, inspections } from '@/db/schema'
import { type GateOutcome, registerGate } from '@/features/gates/registry'

export const CONDITIONS_GATE_KEY = 'conditions.blocking_met'
export const CLOSURE_GATE_KEY = 'closure.requirement_met'

async function hasPassedFinal(tx: Tx, applicationId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: inspections.id })
    .from(inspections)
    .where(
      and(
        eq(inspections.applicationId, applicationId),
        eq(inspections.isFinal, true),
        eq(inspections.status, 'passed'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

async function hasCertificate(tx: Tx, applicationId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: certificatesOfOccupancy.id })
    .from(certificatesOfOccupancy)
    .where(eq(certificatesOfOccupancy.applicationId, applicationId))
    .limit(1)
  return rows.length > 0
}

const PASS: GateOutcome = { status: 'pass' }

registerGate({
  key: CLOSURE_GATE_KEY,
  label: 'Closing requirement met',
  kind: 'administrative',
  appliesTo: ['closed'],
  boundBy: null,
  evaluate: async (tx, app) => {
    const closesOn = app.typeBody.workflow.closesOn
    if (closesOn === 'final_inspection_passed') {
      return (await hasPassedFinal(tx, app.id))
        ? PASS
        : { status: 'blocked', reason: 'No final inspection has passed.' }
    }
    if (closesOn === 'certificate_of_occupancy') {
      return (await hasCertificate(tx, app.id))
        ? PASS
        : { status: 'blocked', reason: 'No certificate of occupancy has been issued.' }
    }
    return PASS
  },
})

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
