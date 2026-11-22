import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { getVersion } from '@/features/config/store'
import { classificationOfApplication } from '@/features/decisions/hearingOptional'
import { displayFieldValue } from '@/features/forms/displayValue'
import type { FormBody, FormField } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { activePack } from '@/features/packs/registry'
import type { DecisionOutcome, ProceedingClassification } from '@/features/packs/schema'

export interface SignificanceFact {
  label: string
  value: string
}

export interface SignificanceQuestion {
  question: string
  help: string | null
  facts?: SignificanceFact[]
}

export interface SignificanceAnswers {
  fields: readonly FormField[]
  values: Readonly<Record<string, FieldValue | undefined>>
}

function answered(value: FieldValue | undefined): value is FieldValue {
  if (value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  return typeof value !== 'string' || value.trim() !== ''
}

function significanceFacts(answers: SignificanceAnswers): SignificanceFact[] {
  const facts: SignificanceFact[] = []
  for (const field of answers.fields) {
    const value = answers.values[field.key]
    if (field.significanceFact !== true || !answered(value)) continue
    facts.push({ label: field.label, value: displayFieldValue(field, value) })
  }
  return facts
}

export function significanceApplies(classification: ProceedingClassification | undefined): boolean {
  return classification?.significanceApplies === true
}

export function significanceQuestion(
  classification: ProceedingClassification | undefined,
  answers?: SignificanceAnswers,
): SignificanceQuestion | null {
  const { significantDecisionQuestion, significantDecisionHelp } = activePack().labels
  if (!significanceApplies(classification) || significantDecisionQuestion === null) return null
  const question = { question: significantDecisionQuestion, help: significantDecisionHelp }
  return answers === undefined ? question : { ...question, facts: significanceFacts(answers) }
}

export async function loadSignificanceQuestion(
  db: DbOrTx,
  app: ApplicationContext,
  signal: AbortSignal,
): Promise<SignificanceQuestion | null> {
  const classification = classificationOfApplication(app)
  if (significanceQuestion(classification) === null) return null
  const form = (await getVersion(db, app.pins.form, signal))?.body as FormBody | undefined
  return significanceQuestion(classification, {
    fields: form?.fields ?? [],
    values: app.values,
  })
}

function asksSignificance(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
): boolean {
  return significanceQuestion(classification) !== null && !outcome.startsWith('rehearing')
}

export function storedSignificance(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
  significant: boolean | undefined,
): boolean | null {
  return asksSignificance(classification, outcome) ? (significant ?? null) : null
}

export function significanceMissing(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
  significant: boolean | undefined,
): boolean {
  return asksSignificance(classification, outcome) && significant === undefined
}
