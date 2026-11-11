import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { Db } from '@/db/client'
import { appealNodes, applications } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { toGraphNodes } from '@/features/decisions/decisionView'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const ADMIN_TO_ZBA_RULE = 'nh.appeal.admin_to_zba'

type NodeRow = typeof appealNodes.$inferSelect

export interface AdministrativeAppealLine {
  applicationId: string
  applicationNumber: string
  typeLabel: string
  decidedOnText: string
  statusText: string
}

export interface ApplicationAppeals {
  applicationId: string
  applicationNumber: string
  typeLabel: string
  graph: GraphNode[]
  nodeChoices: { id: string; label: string }[]
}

function appealWindowEnds(decidedOn: CivilDate): CivilDate {
  const rule = ruleByKey(loadPack(), ADMIN_TO_ZBA_RULE)
  if (rule.kind !== 'clock' || !('value' in rule.length)) return decidedOn
  return computeRuleDue(
    rule,
    { unit: rule.length.unit, value: rule.length.value },
    decidedOn,
    packHolidayCalendar(),
  ).due
}

function statusOf(decision: NodeRow, appeal: NodeRow | undefined, today: CivilDate): string {
  if (appeal !== undefined)
    return `Appealed to the Zoning Board on ${formatCivilDate(appeal.occurredOn)}`
  const ends = appealWindowEnds(decision.occurredOn as CivilDate)
  return ends < today
    ? `Not appealed. The appeal window ended ${formatCivilDate(ends)}.`
    : `Not appealed. The appeal window ends ${formatCivilDate(ends)}.`
}

export async function loadAdministrativeAppeals(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<AdministrativeAppealLine[] | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const decisions = await db
    .select({ node: appealNodes, number: applications.number })
    .from(appealNodes)
    .innerJoin(applications, eq(applications.id, appealNodes.applicationId))
    .where(and(eq(appealNodes.kind, 'administrative_decision'), applicationVisibleTo(actor)))
    .orderBy(desc(appealNodes.occurredOn), desc(appealNodes.createdAt))
  const ids = decisions.map((d) => d.node.id)
  const appeals =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(appealNodes)
          .where(and(inArray(appealNodes.parentId, ids), eq(appealNodes.kind, 'zba_appeal')))
  const today = await townToday(db, now, signal)
  const lines: AdministrativeAppealLine[] = []
  for (const { node, number } of decisions) {
    const app = await loadApplicationContext(db, node.applicationId ?? '', signal)
    lines.push({
      applicationId: node.applicationId ?? '',
      applicationNumber: number,
      typeLabel: app?.typeBody.label ?? '',
      decidedOnText: formatCivilDate(node.occurredOn),
      statusText: statusOf(
        node,
        appeals.find((a) => a.parentId === node.id),
        today,
      ),
    })
  }
  return lines
}

export async function loadApplicationAppeals(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<ApplicationAppeals | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const [visible] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), applicationVisibleTo(actor)))
  if (visible === undefined) return null
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const nodes = await db
    .select()
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
    .orderBy(asc(appealNodes.occurredOn), asc(appealNodes.createdAt))
  const graph = toGraphNodes(nodes)
  return {
    applicationId,
    applicationNumber: app.number,
    typeLabel: app.typeBody.label,
    graph,
    nodeChoices: graph.map((n) => ({ id: n.nodeId, label: `${n.kindLabel}, ${n.dateText}` })),
  }
}
