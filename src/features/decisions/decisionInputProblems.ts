import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import type { DecisionVotes } from '@/db/schema'
import type { DecisionError, RecordDecisionInput } from '@/features/decisions/recordDecision'
import { requiredDecisionFields } from '@/features/decisions/requiredFields'
import { unseatedVoters } from '@/features/decisions/seatedVoters'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import type { RecordRule } from '@/features/packs/schema'

function writtenDecisionRule(): RecordRule | null {
  const key = packRoles().rules.writtenDecision
  if (key === null) return null
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'required_record') {
    throw new AppError(
      ErrorIds.PACK_UNKNOWN_RULE,
      'The written decision rule is not a record rule',
      {
        key,
      },
    )
  }
  return rule
}

function missingFieldsOf(input: RecordDecisionInput): string[] {
  const filled: Record<string, boolean> = {
    findings: input.findings.trim() !== '',
    conditions: (input.conditions ?? []).length > 0,
    reasonsForDisapproval: (input.reasonsForDisapproval ?? '').trim() !== '',
  }
  const rule = writtenDecisionRule()
  if (rule === null) return []
  return requiredDecisionFields(rule, input.outcome).filter((f) => filled[f] !== true)
}

export function votesConsistent(votes: DecisionVotes): boolean {
  const count = (vote: 'for' | 'against' | 'abstain') =>
    votes.members.filter((m) => m.vote === vote).length
  return (
    count('for') === votes.for &&
    count('against') === votes.against &&
    count('abstain') === votes.abstain
  )
}

export async function inputProblem(
  tx: Tx,
  boardId: string | null,
  input: RecordDecisionInput,
): Promise<DecisionError | null> {
  const missing = missingFieldsOf(input)
  if (missing.length > 0) return { missingFields: missing }
  if (!votesConsistent(input.votes)) return 'votes_inconsistent'
  if (boardId === null) return null
  const voters = input.votes.members.map((m) => m.name)
  const notSeated = await unseatedVoters(tx, boardId, input.votedOn, voters)
  return notSeated.length > 0 ? { notSeated } : null
}
