export type IntakeStep = 'form' | 'documents' | 'submit' | 'done'

export function intakeHref(applicationId: string, step?: IntakeStep): string {
  const base = `/staff/counter/take/${applicationId}`
  return step === undefined ? base : `${base}?step=${step}`
}
