import type { PackRoles } from './roles'

interface RoleTargets {
  ruleKeys: ReadonlySet<string>
  classificationKeys: ReadonlySet<string>
  seriesKeys: ReadonlySet<string>
}

function named(value: string | readonly string[] | null): string[] {
  if (value === null) return []
  return typeof value === 'string' ? [value] : [...value]
}

function unknownIn(
  section: Record<string, string | readonly string[] | null>,
  sectionName: string,
  known: ReadonlySet<string>,
  noun: string,
): string[] {
  return Object.entries(section).flatMap(([role, value]) =>
    named(value)
      .filter((key) => !known.has(key))
      .map((key) => `role ${sectionName}.${role} names unknown ${noun} ${key}`),
  )
}

function groupMatches(entry: string, ruleKeys: ReadonlySet<string>): boolean {
  return entry.endsWith('.')
    ? [...ruleKeys].some((key) => key.startsWith(entry))
    : ruleKeys.has(entry)
}

export function roleIssues(roles: PackRoles, targets: RoleTargets): string[] {
  const groups = Object.entries(roles.ruleGroups).flatMap(([group, entries]) =>
    entries
      .filter((entry) => !groupMatches(entry, targets.ruleKeys))
      .map((entry) => `role ruleGroups.${group} entry ${entry} matches no rule`),
  )
  const gates =
    roles.gates.abutterListFresh !== null && roles.rules.abutterListAge === null
      ? ['role gates.abutterListFresh needs rules.abutterListAge']
      : []
  return [
    ...unknownIn(roles.rules, 'rules', targets.ruleKeys, 'rule'),
    ...unknownIn(
      roles.classifications,
      'classifications',
      targets.classificationKeys,
      'classification',
    ),
    ...unknownIn(roles.recordSeries, 'recordSeries', targets.seriesKeys, 'series'),
    ...groups,
    ...gates,
  ]
}
