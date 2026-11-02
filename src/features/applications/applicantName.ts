export const PLACEHOLDER_PARTY_NAME = 'Applicant'

export function formApplicantName(values: Record<string, unknown>): string | null {
  const value = values.applicant_name
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function namedParty(name: string): string | null {
  const trimmed = name.trim()
  return trimmed === '' || trimmed === PLACEHOLDER_PARTY_NAME ? null : trimmed
}
