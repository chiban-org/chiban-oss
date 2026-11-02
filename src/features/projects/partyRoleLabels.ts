const PARTY_ROLE_LABELS = new Map<string, string>([
  ['owner', 'Owner'],
  ['agent', 'Agent'],
  ['contractor', 'Contractor'],
  ['applicant', 'Applicant'],
])

export function partyRoleLabel(role: string): string {
  return PARTY_ROLE_LABELS.get(role) ?? role
}

export function partyLine(name: string, role: string): string {
  const label = partyRoleLabel(role)
  return name.toLowerCase() === label.toLowerCase() ? label : `${name}, ${label}`
}
