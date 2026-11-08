export interface ClosingCopy {
  note: string
  confirm: string
}

export function closingCopy(
  isFinal: boolean,
  closesOn: string,
  permitNumber: string,
): ClosingCopy | null {
  if (!isFinal) return null
  if (closesOn === 'certificate_of_occupancy') {
    return {
      note: `Passing this final leaves permit ${permitNumber} waiting for its certificate of occupancy.`,
      confirm: `Permit ${permitNumber} then waits for its certificate of occupancy.`,
    }
  }
  return {
    note: `Passing this final closes permit ${permitNumber}.`,
    confirm: `This closes permit ${permitNumber}.`,
  }
}
