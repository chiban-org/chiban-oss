import { desc, eq, inArray } from 'drizzle-orm'
import { enforcementCases, enforcementOrders, users, violationFindings } from '@/db/schema'
import { designationOn } from '@/features/enforcement/designations'
import { orderDocumentInput } from '@/features/enforcement/orderPdf'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { documentFrame } from '@/features/pdf/documentFrame'
import { type PreviewSource, SAMPLE_LIMIT } from '@/features/templates/preview/previewTypes'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'

const STATUS_WORDS: Record<string, string> = { draft: 'draft', issued: 'issued' }

export const ENFORCEMENT_ORDER_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: enforcementOrders.id,
        number: enforcementOrders.number,
        status: enforcementOrders.status,
        property: enforcementCases.locationText,
      })
      .from(enforcementOrders)
      .innerJoin(enforcementCases, eq(enforcementCases.id, enforcementOrders.caseId))
      .orderBy(desc(enforcementOrders.createdAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${r.number}, ${r.property} (${STATUS_WORDS[r.status] ?? r.status.replaceAll('_', ' ')})`,
    }))
  },
  async input({ db, signal }, id) {
    const [row] = await db
      .select({ order: enforcementOrders, place: enforcementCases.locationText })
      .from(enforcementOrders)
      .innerJoin(enforcementCases, eq(enforcementCases.id, enforcementOrders.caseId))
      .where(eq(enforcementOrders.id, id))
    if (row === undefined) return null
    const { order } = row
    const rule = ruleByKey(loadPack(), order.ruleKey, order.ruleVersion)
    if (rule.kind !== 'cease_and_desist') return null
    const findings =
      order.findingIds.length === 0
        ? []
        : await db
            .select()
            .from(violationFindings)
            .where(inArray(violationFindings.id, order.findingIds))
    const issuedOn = (order.issuedOn ?? (await townToday(db, new Date(), signal))) as CivilDate
    const issuerId = order.issuedBy ?? order.draftedBy
    const [issuer] = await db.select().from(users).where(eq(users.id, issuerId))
    const designation = await designationOn(db, issuerId, issuedOn)
    return orderDocumentInput({
      frame: await documentFrame(db, {}, signal),
      number: order.number,
      rule,
      locationText: row.place,
      findings,
      correctiveAction: order.correctiveAction,
      correctiveDeadline: order.correctiveDeadline,
      ceaseImmediately: order.ceaseImmediately,
      issuedOn,
      issuerName: issuer?.displayName ?? '',
      issuerTitle: designation?.title ?? 'Enforcement officer',
    })
  },
}
