import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { projectParties } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { linkNewContractorParty } from '@/features/contractors/accountLink'
import { err, ok, type Result } from '@/types/result'

export type ContractorChoice =
  | { kind: 'keep' }
  | { kind: 'party'; partyId: string }
  | { kind: 'new'; name: string; email?: string }

export interface PartyRow {
  id: string
  name: string
  role: 'owner' | 'agent' | 'contractor' | 'applicant'
  userId: string | null
  email: string | null
}

export interface ContractorPlan {
  removed: PartyRow[]
  added: { name: string; email: string | null; userId: string | null } | null
}

export type ContractorError = 'unknown_party' | 'contractor_name_required'

const NO_CHANGE: ContractorPlan = { removed: [], added: null }

export async function activeParties(db: DbOrTx, projectId: string): Promise<PartyRow[]> {
  return await db
    .select({
      id: projectParties.id,
      name: projectParties.name,
      role: projectParties.role,
      userId: projectParties.userId,
      email: projectParties.email,
    })
    .from(projectParties)
    .where(and(eq(projectParties.projectId, projectId), isNull(projectParties.removedAt)))
    .orderBy(projectParties.addedAt)
}

export function currentContractor(parties: PartyRow[]): PartyRow | null {
  return parties.find((p) => p.role === 'contractor') ?? null
}

function fromParty(parties: PartyRow[], partyId: string): Result<ContractorPlan, ContractorError> {
  const chosen = parties.find((p) => p.id === partyId)
  if (chosen === undefined) return err('unknown_party')
  const others = parties.filter((p) => p.role === 'contractor' && p.id !== chosen.id)
  if (chosen.role === 'contractor') {
    return ok(
      currentContractor(parties)?.id === chosen.id ? NO_CHANGE : { removed: others, added: null },
    )
  }
  return ok({
    removed: others,
    added: { name: chosen.name, email: chosen.email, userId: chosen.userId },
  })
}

export function planContractor(
  parties: PartyRow[],
  choice: ContractorChoice,
): Result<ContractorPlan, ContractorError> {
  if (choice.kind === 'keep') return ok(NO_CHANGE)
  if (choice.kind === 'party') return fromParty(parties, choice.partyId)
  const name = choice.name.trim()
  if (name === '') return err('contractor_name_required')
  const email = choice.email?.trim() ?? ''
  return ok({
    removed: parties.filter((p) => p.role === 'contractor'),
    added: { name, email: email === '' ? null : email, userId: null },
  })
}

export async function applyContractorPlan(
  tx: Tx,
  actor: Actor,
  projectId: string,
  plan: ContractorPlan,
  signal: AbortSignal,
): Promise<void> {
  const audit = (action: string, partyId: string) =>
    writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action,
        entityType: 'project',
        entityId: projectId,
        after: { partyId, role: 'contractor' },
      },
      signal,
    )
  for (const party of plan.removed) {
    await tx
      .update(projectParties)
      .set({ removedAt: new Date() })
      .where(eq(projectParties.id, party.id))
    await audit('project.party.remove', party.id)
  }
  if (plan.added === null) return
  const [row] = await tx
    .insert(projectParties)
    .values({ projectId, role: 'contractor', addedBy: actor.userId, ...plan.added })
    .returning({ id: projectParties.id })
  await audit('project.party.add', row?.id ?? '')
  if (row !== undefined && plan.added.email !== null && plan.added.userId === null) {
    await linkNewContractorParty(
      tx,
      { partyId: row.id, email: plan.added.email },
      { actorUserId: actor.userId, signal },
    )
  }
}
