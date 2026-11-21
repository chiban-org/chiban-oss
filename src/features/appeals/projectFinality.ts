import { asc, eq } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { applications, projects } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { loadPack, type Pack } from '@/features/packs/loadPack'
import { type BoardKind, BoardKindSchema, type DecisionOutcome } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export const PROJECT_FINAL_APPROVAL = 'project_final_approval'

export interface ProjectFinality {
  finalOn: CivilDate
  finalReviewBoard: BoardKind
}

const APPROVING: readonly string[] = ['approved', 'approved_with_conditions']

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
  projectId: string
  outcome: DecisionOutcome
  votedOn: CivilDate
  boardKind: BoardKind | null
}

export async function declareFinalApproval(
  tx: Tx,
  input: FinalApprovalDeclaration,
  signal: AbortSignal,
): Promise<void> {
  if (input.declared !== true || input.boardKind === null) return
  if (!isApprovingOutcome(input.outcome) || !packWaitsForFinalApproval()) return
  signal.throwIfAborted()
  await tx
    .update(projects)
    .set({ finalApprovalOn: input.votedOn, finalReviewBoard: input.boardKind })
    .where(eq(projects.id, input.projectId))
  const members = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.projectId, input.projectId))
    .orderBy(asc(applications.seq))
  for (const member of members) {
    await startClocksFor(tx, member.id, PROJECT_FINAL_APPROVAL, input.votedOn, signal)
  }
}
