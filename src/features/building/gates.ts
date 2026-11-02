import { and, desc, eq, ne } from 'drizzle-orm'
import {
  clocks,
  codeEditionRecords,
  regionalImpactDeterminations,
  regionalImpactNotices,
} from '@/db/schema'
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

export const REGIONAL_IMPACT_GATE_KEY = 'nh.bp.regional_impact'
const COMMENT_CLOCK_RULE_KEY = 'nh.bp.regional_impact_comment'

registerGate({
  key: REGIONAL_IMPACT_GATE_KEY,
  kind: 'statutory',
  appliesTo: ['issued'],
  boundBy: REGIONAL_IMPACT_GATE_KEY,
  evaluate: async (tx, app, today) => {
    const [determination] = await tx
      .select()
      .from(regionalImpactDeterminations)
      .where(eq(regionalImpactDeterminations.applicationId, app.id))
    if (determination === undefined) {
      return {
        status: 'unknown',
        reason: 'Regional impact determination not recorded (RSA 36:57 IV).',
      }
    }
    if (determination.determination !== 'yes') return { status: 'pass' }
    const commission = await tx
      .select({ id: regionalImpactNotices.id })
      .from(regionalImpactNotices)
      .where(
        and(
          eq(regionalImpactNotices.applicationId, app.id),
          eq(regionalImpactNotices.recipientKind, 'regional_planning_commission'),
          eq(regionalImpactNotices.method, 'certified_mail'),
        ),
      )
      .limit(1)
    if (commission.length === 0) {
      return {
        status: 'blocked',
        reason: 'Regional planning commission not yet notified by certified mail.',
      }
    }
    const [clock] = await tx
      .select()
      .from(clocks)
      .where(
        and(
          eq(clocks.applicationId, app.id),
          eq(clocks.ruleKey, COMMENT_CLOCK_RULE_KEY),
          ne(clocks.status, 'superseded'),
        ),
      )
      .orderBy(desc(clocks.createdAt))
      .limit(1)
    if (clock !== undefined && today <= clock.currentDue) {
      return { status: 'blocked', reason: `Comment period open through ${clock.currentDue}.` }
    }
    return { status: 'pass' }
  },
})
