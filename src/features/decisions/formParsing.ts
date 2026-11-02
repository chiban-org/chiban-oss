import type { DecisionCondition, DecisionVotes } from '@/db/schema'

type Vote = DecisionVotes['members'][number]['vote']

const VOTES: readonly Vote[] = ['for', 'against', 'abstain', 'recused']
const LINE = /^(.+?)\s*[:\-]\s*([A-Za-z]+)$/
const BEFORE_ISSUANCE = /^before issuance:\s*/i

function lines(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

export function parseVotes(raw: string): DecisionVotes | null {
  const members: DecisionVotes['members'] = []
  for (const line of lines(raw)) {
    const match = LINE.exec(line)
    const name = match?.[1]?.trim()
    const vote = VOTES.find((v) => v === match?.[2]?.toLowerCase())
    if (name === undefined || name === '' || vote === undefined) return null
    members.push({ name, vote })
  }
  if (members.length === 0) return null
  const count = (vote: Vote) => members.filter((m) => m.vote === vote).length
  return { for: count('for'), against: count('against'), abstain: count('abstain'), members }
}

export function parseConditions(raw: string): DecisionCondition[] {
  return lines(raw).map((line, index) => ({
    code: `C${index + 1}`,
    text: line.replace(BEFORE_ISSUANCE, ''),
    precedent: BEFORE_ISSUANCE.test(line),
  }))
}
