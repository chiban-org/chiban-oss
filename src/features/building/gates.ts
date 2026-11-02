import { eq } from 'drizzle-orm'
import { codeEditionRecords } from '@/db/schema'
import { registerGate } from '@/features/gates/registry'

export const CODE_EDITION_GATE_KEY = 'nh.bp.code_edition_recorded'

registerGate({
  key: CODE_EDITION_GATE_KEY,
  kind: 'statutory',
  appliesTo: ['issued'],
  boundBy: CODE_EDITION_GATE_KEY,
  evaluate: async (tx, app) => {
    const [record] = await tx
      .select({ id: codeEditionRecords.applicationId })
      .from(codeEditionRecords)
      .where(eq(codeEditionRecords.applicationId, app.id))
    return record === undefined
      ? { status: 'blocked', reason: 'State building code edition not recorded (RSA 155-A:2).' }
      : { status: 'pass' }
  },
})
