export interface RuleChoice {
  key: string
  label: string
}

const BUILDING_PREFIXES = ['nh.bp.']
const BOARD_PREFIXES = ['nh.pb.', 'nh.zba.', 'nh.ri.', 'nh.board.']

export function ruleChoicesFor(
  rules: RuleChoice[],
  classification: { board: string | null } | undefined,
): RuleChoice[] {
  if (classification === undefined) return rules
  const foreign = classification.board === null ? BOARD_PREFIXES : BUILDING_PREFIXES
  return rules.filter((r) => !foreign.some((prefix) => r.key.startsWith(prefix)))
}
