import { NH_APPEAL_ROUTES } from '@packs/nh/appealRoutes'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { ChecklistItem } from '@/components/notices/NoticeChecklist'
import type { Db } from '@/db/client'
import {
  appealNodes,
  boardDecisions,
  clocks,
  documents,
  noticeSets,
  regionalImpactDeterminations,
} from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { TRANSMITTAL_SUBJECT } from '@/features/decisions/regionalTransmittal'
import { channelLabel } from '@/features/notices/channels'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { proofMethodLabel } from '@/features/notices/proofMethods'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const NODE_LABELS = {
  administrative_decision: 'Administrative decision',
  zba_decision: 'Zoning Board decision',
  pb_decision: 'Planning Board decision',
  zba_appeal: 'Appeal to the Zoning Board',
  rehearing_motion: 'Motion for rehearing',
  rehearing_outcome: 'Rehearing decision',
  court_petition: 'Court petition',
} as const

const OUTCOME_WORDS: Record<string, string> = {
  ...OUTCOME_LABELS,
  granted: 'Granted',
}

export interface DecisionView {
  decisionId: string
  applicationId: string
  applicationNumber: string
  typeLabel: string
  outcomeText: string
  votedOnText: string
  motion: string
  voteText: string
  findings: string
  conditions: { text: string; precedent: boolean }[]
  reasons: string | null
  documentsGenerated: boolean
  filedText: string | null
  filingDueText: string | null
  minutesChoices: { id: string; label: string }[]
  regional: boolean
  transmittalStarted: boolean
  transmittal: {
    checklist: ChecklistItem[]
    itemChoices: { id: string; label: string }[]
  } | null
  graph: GraphNode[]
  nodeChoices: { id: string; label: string }[]
}

async function filingDue(db: Db, applicationId: string): Promise<string | null> {
  const [clock] = await db
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(
      and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, 'nh.board.decision_filing')),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock === undefined ? null : formatCivilDate(clock.currentDue)
}

function windowOf(node: typeof appealNodes.$inferSelect): GraphNode['window'] {
  const route = NH_APPEAL_ROUTES.filter((r) => r.from === node.kind && r.windowRuleKey !== null)
  const first = route[0]
  if (first === undefined || first.windowRuleKey === null) return null
  const rule = ruleByKey(loadPack(), first.windowRuleKey)
  if (rule.kind !== 'clock' || !('value' in rule.length)) return null
  const due = computeRuleDue(
    rule,
    { unit: rule.length.unit, value: rule.length.value },
    node.occurredOn as CivilDate,
    packHolidayCalendar(),
  ).due
  return { label: rule.label, dueText: formatCivilDate(due), consequence: rule.consequence.text }
}

export function toGraphNodes(rows: (typeof appealNodes.$inferSelect)[]): GraphNode[] {
  return rows.map((n) => ({
    nodeId: n.id,
    kindLabel: NODE_LABELS[n.kind],
    dateText: formatCivilDate(n.occurredOn),
    outcomeText: n.outcome === null ? null : (OUTCOME_WORDS[n.outcome] ?? null),
    status: n.status,
    untimely: n.untimely,
    parentId: n.parentId,
    window: windowOf(n),
  }))
}

async function checklistFor(db: Db, setId: string, signal: AbortSignal): Promise<ChecklistItem[]> {
  const status = await noticeStatus(db, setId, signal)
  return status.items.map((i) => ({
    itemId: i.itemId,
    channel: channelLabel(i.channel),
    recipientName: i.recipientName,
    recipientAddress: i.recipientAddress,
    dueOn: formatCivilDate(i.dueOn),
    proof:
      i.proof === null
        ? null
        : {
            method: proofMethodLabel(i.proof.method),
            reference: i.proof.reference,
            effectiveOn: formatCivilDate(i.proof.effectiveOn),
          },
    state: i.state,
  }))
}

export async function loadDecisionView(
  db: Db,
  actor: Actor,
  decisionId: string,
  signal: AbortSignal,
): Promise<DecisionView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const [decision] = await db.select().from(boardDecisions).where(eq(boardDecisions.id, decisionId))
  if (decision === undefined) return null
  const app = await loadApplicationContext(db, decision.applicationId, signal)
  if (app === null) return null
  const docs = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(eq(documents.recordId, decision.applicationId))
    .orderBy(asc(documents.seq))
  const nodes = await db
    .select()
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, decision.applicationId))
    .orderBy(asc(appealNodes.occurredOn), asc(appealNodes.createdAt))
  const [regional] = await db
    .select({ determination: regionalImpactDeterminations.determination })
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, decision.applicationId))
  const [transmittal] = await db
    .select({ id: noticeSets.id })
    .from(noticeSets)
    .where(
      and(eq(noticeSets.subjectKind, TRANSMITTAL_SUBJECT), eq(noticeSets.subjectId, decisionId)),
    )
  const graph = toGraphNodes(nodes)
  const transmittalItems =
    transmittal === undefined ? null : await checklistFor(db, transmittal.id, signal)
  return {
    decisionId,
    applicationId: app.id,
    applicationNumber: app.number,
    typeLabel: app.typeBody.label,
    outcomeText: OUTCOME_LABELS[decision.outcome],
    votedOnText: formatCivilDate(decision.votedOn),
    motion: decision.motion,
    voteText: `${decision.votes.for} for, ${decision.votes.against} against, ${decision.votes.abstain} abstaining`,
    findings: decision.findings,
    conditions: decision.conditions.map((c) => ({ text: c.text, precedent: c.precedent })),
    reasons: decision.reasonsForDisapproval,
    documentsGenerated: decision.writtenDecisionDocumentId !== null,
    filedText: decision.filedOn === null ? null : formatCivilDate(decision.filedOn),
    filingDueText: await filingDue(db, decision.applicationId),
    minutesChoices: docs.map((d) => ({ id: d.id, label: d.title })),
    regional: regional?.determination === 'yes',
    transmittalStarted: transmittal !== undefined,
    transmittal:
      transmittalItems === null
        ? null
        : {
            checklist: transmittalItems,
            itemChoices: transmittalItems.map((i) => ({
              id: i.itemId,
              label: i.recipientName ?? i.channel,
            })),
          },
    graph,
    nodeChoices: nodes.map((n, i) => ({
      id: n.id,
      label: `${graph[i]?.kindLabel ?? ''}, ${graph[i]?.dateText ?? ''}`,
    })),
  }
}
