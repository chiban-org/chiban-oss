import type { RecordRule } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import type { DecisionVotes } from '@/db/schema'
import type { DecisionError, RecordDecisionInput } from '@/features/decisions/recordDecision'
import { requiredDecisionFields } from '@/features/decisions/requiredFields'
import { unseatedVoters } from '@/features/decisions/seatedVoters'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'

function writtenDecisionRule(): RecordRule {
  const rule = ruleByKey(loadPack(), 'nh.board.written_decision')
  if (rule.kind !== 'required_record') {
    throw new AppError(
      ErrorIds.PACK_UNKNOWN_RULE,
      'nh.board.written_decision must be a record rule',
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
  return requiredDecisionFields(writtenDecisionRule(), input.outcome).filter(
    (f) => filled[f] !== true,
  )
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
