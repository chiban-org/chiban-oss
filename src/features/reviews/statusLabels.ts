const REVIEW_STATUS_LABELS = new Map<string, string>([
  ['pending', 'Pending'],
  ['commented', 'Commented'],
  ['signed_off', 'Signed off'],
])

export function reviewStatusLabel(status: string): string {
  return REVIEW_STATUS_LABELS.get(status) ?? status
}
