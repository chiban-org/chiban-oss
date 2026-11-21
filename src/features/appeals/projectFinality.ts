import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { appealNodes, applications, projects } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { startClocksFor } from '@/features/clocks/startClocks'
import { loadPack, type Pack } from '@/features/packs/loadPack'
import { type BoardKind, BoardKindSchema } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const PROJECT_FINAL_APPROVAL = 'project_final_approval'

export interface ProjectFinality {
  finalOn: CivilDate
  finalReviewBoard: BoardKind
}

const APPROVING: readonly string[] = ['approved', 'approved_with_conditions']
const DECISION_NODE_KINDS = ['zba_decision', 'pb_decision'] as const

export function isApprovingOutcome(outcome: string | null): boolean {
  return outcome !== null && APPROVING.includes(outcome)
}

export function packWaitsForFinalApproval(pack: Pack = loadPack()): boolean {
  return pack.rules.some((r) => r.kind === 'clock' && r.startEvent === PROJECT_FINAL_APPROVAL)
}

export function ruleWaitsForFinalApproval(ruleKey: string, pack: Pack = loadPack()): boolean {
  return pack.rules.some(
    (r) => r.kind === 'clock' && r.key === ruleKey && r.startEvent === PROJECT_FINAL_APPROVAL,
  )
}

function finalityOf(row: {
  finalApprovalOn: string | null
  finalReviewBoard: string | null
}): ProjectFinality | null {
  const board = BoardKindSchema.safeParse(row.finalReviewBoard)
  if (row.finalApprovalOn === null || !board.success) return null
  return { finalOn: row.finalApprovalOn as CivilDate, finalReviewBoard: board.data }
}

export async function projectFinality(
  db: DbOrTx,
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectFinality | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      finalApprovalOn: projects.finalApprovalOn,
      finalReviewBoard: projects.finalReviewBoard,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
  return row === undefined ? null : finalityOf(row)
}

export async function applicationProjectFinality(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<ProjectFinality | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      finalApprovalOn: projects.finalApprovalOn,
      finalReviewBoard: projects.finalReviewBoard,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.id, applicationId))
  return row === undefined ? null : finalityOf(row)
}

export interface FinalApprovalDeclaration {
  declared: boolean | undefined
  applicationId: string | null
  outcome: string | null
  votedOn: CivilDate
  boardKind: BoardKind | null
  actorUserId: string
  decisionId: string | null
  appealNodeId?: string
}

function joinsFinalProject(input: {
  applicationId: string | null
  boardKind: BoardKind | null
  outcome: string | null
}): input is { applicationId: string; boardKind: BoardKind; outcome: string } {
  return (
    input.applicationId !== null &&
    input.boardKind !== null &&
    isApprovingOutcome(input.outcome) &&
    packWaitsForFinalApproval()
  )
}

async function lockedProjectOf(tx: Tx, applicationId: string) {
  const [member] = await tx
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  if (member === undefined) return undefined
  const [row] = await tx
    .select({
      id: projects.id,
      finalApprovalOn: projects.finalApprovalOn,
      finalReviewBoard: projects.finalReviewBoard,
    })
    .from(projects)
    .where(eq(projects.id, member.projectId))
    .for('update')
  return row
}

async function approvedMembers(tx: Tx, projectId: string): Promise<string[]> {
  const nodes = await tx
    .select({
      applicationId: appealNodes.applicationId,
      outcome: appealNodes.outcome,
    })
    .from(appealNodes)
    .innerJoin(applications, eq(applications.id, appealNodes.applicationId))
    .where(
      and(
        eq(applications.projectId, projectId),
        inArray(appealNodes.kind, [...DECISION_NODE_KINDS]),
      ),
    )
    .orderBy(asc(applications.seq), desc(appealNodes.occurredOn), desc(appealNodes.createdAt))
  const latest = new Map<string, string | null>()
  for (const node of nodes) {
    if (node.applicationId !== null && !latest.has(node.applicationId))
      latest.set(node.applicationId, node.outcome)
  }
  return [...latest].filter(([, outcome]) => isApprovingOutcome(outcome)).map(([id]) => id)
}

export async function declareFinalApproval(
  tx: Tx,
  input: FinalApprovalDeclaration,
  signal: AbortSignal,
): Promise<Result<void, 'already_final'>> {
  if (!joinsFinalProject(input)) return ok(undefined)
  signal.throwIfAborted()
  const project = await lockedProjectOf(tx, input.applicationId)
  if (project === undefined) return ok(undefined)
  const finality = finalityOf(project)
  if (input.declared !== true) {
    if (finality === null) return ok(undefined)
    await startClocksFor(
      tx,
      input.applicationId,
      PROJECT_FINAL_APPROVAL,
      finality.finalOn,
      signal,
      undefined,
      undefined,
      { finalReviewBoard: finality.finalReviewBoard },
    )
    return ok(undefined)
  }
  if (finality !== null) return err('already_final')
  await tx
    .update(projects)
    .set({ finalApprovalOn: input.votedOn, finalReviewBoard: input.boardKind })
    .where(eq(projects.id, project.id))
  for (const applicationId of await approvedMembers(tx, project.id)) {
    await startClocksFor(
      tx,
      applicationId,
      PROJECT_FINAL_APPROVAL,
      input.votedOn,
      signal,
      undefined,
      undefined,
      { finalReviewBoard: input.boardKind },
    )
  }
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: input.actorUserId },
      action: 'project.final_approval',
      entityType: 'project',
      entityId: project.id,
      after: {
        finalApprovalOn: input.votedOn,
        finalReviewBoard: input.boardKind,
        decisionId: input.decisionId,
        ...(input.appealNodeId === undefined ? {} : { appealNodeId: input.appealNodeId }),
      },
    },
    signal,
  )
  return ok(undefined)
}
