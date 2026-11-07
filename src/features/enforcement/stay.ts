import { and, asc, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementAppeals, perilCertifications, restrainingOrders } from '@/db/schema'
import { loadPack } from '@/features/packs/loadPack'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface StayState {
  stayed: boolean
  reason: 'appeal_pending' | 'restraining_order' | null
  appealId: string | null
}

export const NOT_STAYED: StayState = { stayed: false, reason: null, appealId: null }

function stayRule() {
  const rule = loadPack().rules.find(
    (r) => r.kind === 'effect' && r.effect === 'stay_enforcement_on_appeal',
  )
  return rule ?? null
}

export function stayRuleActive(): boolean {
  return stayRule() !== null
}

export async function staysFor(
  db: DbOrTx,
  caseIds: readonly string[],
  today: CivilDate,
  signal: AbortSignal,
): Promise<Map<string, StayState>> {
  signal.throwIfAborted()
  const states = new Map<string, StayState>(caseIds.map((id) => [id, NOT_STAYED]))
  if (stayRule() === null || caseIds.length === 0) return states
  const open = await db
    .select({ id: enforcementAppeals.id, caseId: enforcementAppeals.caseId })
    .from(enforcementAppeals)
    .where(
      and(
        inArray(enforcementAppeals.caseId, [...caseIds]),
        lte(enforcementAppeals.filedOn, today),
        or(isNull(enforcementAppeals.resolvedOn), gt(enforcementAppeals.resolvedOn, today)),
      ),
    )
    .orderBy(asc(enforcementAppeals.filedOn))
  if (open.length === 0) return states
  const appealIds = open.map((a) => a.id)
  const [certified, restrained] = await Promise.all([
    db
      .select({ appealId: perilCertifications.appealId })
      .from(perilCertifications)
      .where(
        and(
          inArray(perilCertifications.appealId, appealIds),
          lte(perilCertifications.certifiedOn, today),
        ),
      ),
    db
      .select({ appealId: restrainingOrders.appealId })
      .from(restrainingOrders)
      .where(
        and(
          inArray(restrainingOrders.appealId, appealIds),
          lte(restrainingOrders.issuedOn, today),
          or(isNull(restrainingOrders.dissolvedOn), gt(restrainingOrders.dissolvedOn, today)),
        ),
      ),
  ])
  const certifiedIds = new Set(certified.map((c) => c.appealId))
  const restrainedIds = new Set(restrained.map((r) => r.appealId))
  for (const appeal of open) {
    if (states.get(appeal.caseId)?.stayed === true) continue
    if (!certifiedIds.has(appeal.id)) {
      states.set(appeal.caseId, { stayed: true, reason: 'appeal_pending', appealId: appeal.id })
    } else if (restrainedIds.has(appeal.id)) {
      states.set(appeal.caseId, { stayed: true, reason: 'restraining_order', appealId: appeal.id })
    }
  }
  return states
}

export async function stayFor(
  db: DbOrTx,
  caseId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<StayState> {
  return (await staysFor(db, [caseId], today, signal)).get(caseId) ?? NOT_STAYED
}

export function stayBanner(
  stay: StayState,
  appealFiledOn: CivilDate | null,
  certifiedOn: CivilDate | null,
): string | null {
  const cite = stayRule()?.citation.label ?? 'RSA 676:6'
  if (stay.reason === 'appeal_pending' && appealFiledOn !== null) {
    return `Enforcement stayed by appeal to the ZBA filed ${formatCivilDate(appealFiledOn)} (${cite}).`
  }
  if (stay.reason === 'restraining_order') {
    return `Enforcement stayed by a restraining order issued in the appeal (${cite}).`
  }
  if (certifiedOn !== null) {
    return `Not stayed: the officer certified imminent peril on ${formatCivilDate(certifiedOn)}. Only a restraining order from the ZBA or the superior court stops these proceedings.`
  }
  return null
}
