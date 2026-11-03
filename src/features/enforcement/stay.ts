import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm'
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

async function appealStay(
  db: DbOrTx,
  appealId: string,
  today: CivilDate,
): Promise<StayState | null> {
  const [certification] = await db
    .select({ id: perilCertifications.id })
    .from(perilCertifications)
    .where(
      and(eq(perilCertifications.appealId, appealId), lte(perilCertifications.certifiedOn, today)),
    )
  if (certification === undefined) return { stayed: true, reason: 'appeal_pending', appealId }
  const [restraint] = await db
    .select({ id: restrainingOrders.id })
    .from(restrainingOrders)
    .where(
      and(
        eq(restrainingOrders.appealId, appealId),
        lte(restrainingOrders.issuedOn, today),
        or(isNull(restrainingOrders.dissolvedOn), gt(restrainingOrders.dissolvedOn, today)),
      ),
    )
  return restraint === undefined ? null : { stayed: true, reason: 'restraining_order', appealId }
}

export async function stayFor(
  db: DbOrTx,
  caseId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<StayState> {
  signal.throwIfAborted()
  if (stayRule() === null) return NOT_STAYED
  const open = await db
    .select({ id: enforcementAppeals.id })
    .from(enforcementAppeals)
    .where(
      and(
        eq(enforcementAppeals.caseId, caseId),
        lte(enforcementAppeals.filedOn, today),
        or(isNull(enforcementAppeals.resolvedOn), gt(enforcementAppeals.resolvedOn, today)),
      ),
    )
    .orderBy(asc(enforcementAppeals.filedOn))
  for (const appeal of open) {
    const state = await appealStay(db, appeal.id, today)
    if (state !== null) return state
  }
  return NOT_STAYED
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
