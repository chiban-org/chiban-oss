const SENTENCES: Record<string, string> = {
  parcel_not_found: 'No parcel in Chiban matches the parcel ID on this row.',
  party_refused: 'The applicant, owner or contractor on this row could not be added.',
  fee_waiver_refused: 'The fees paid in the prior system could not be recorded as waived.',
  state_not_carried: 'The state from the prior system could not be carried over.',
  future_date: 'A date on this row is in the future.',
  unknown_application_type: 'The application type key does not match an adopted application type.',
  invalid_state: 'The state must be submitted, under_review, decided or issued.',
  invalid_received_date: 'The received date must be a real date written as YYYY-MM-DD.',
  invalid_completed_date: 'The completed date must be a real date written as YYYY-MM-DD.',
  invalid_decided_on: 'The decided date must be a real date written as YYYY-MM-DD.',
  invalid_issued_on: 'The issued date must be a real date written as YYYY-MM-DD.',
  received_date_required: 'The received date is required.',
  issued_on_required: 'An issued application needs an issued date.',
  decided_on_required: 'A decided application needs a decided date.',
  legacy_number_required: 'The legacy number is required.',
  invalid_fees_paid_in_prior_system:
    'Fees paid in the prior system must be yes or no (or left empty), not an amount.',
}

const FIELD_CODES: Record<string, string> = {
  required: 'is required',
  invalid: 'is not valid',
  too_long: 'is too long',
  too_short: 'is too short',
}

export function cutoverErrorSentence(code: string): string {
  const known = SENTENCES[code]
  if (known !== undefined) return known
  const field = /^([a-z0-9_.]+): ([a-z_]+)$/.exec(code)
  if (field?.[1] !== undefined && field[2] !== undefined) {
    const name = field[1].replace(/^field\./, '').replaceAll('_', ' ')
    return `The ${name} field ${FIELD_CODES[field[2]] ?? 'needs attention'}.`
  }
  return code
}
