export function inRuleGroup(ruleKey: string, group: readonly string[]): boolean {
  return group.some((entry) =>
    entry.endsWith('.') ? ruleKey.startsWith(entry) : ruleKey === entry,
  )
}
