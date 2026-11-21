import { SelectField } from '@/components/staff/fields'
import type { SignificanceQuestion } from '@/features/decisions/significance'

const ANSWERS: [string, string][] = [
  ['', 'Choose one'],
  ['yes', 'Yes'],
  ['no', 'No'],
]

export function SignificanceSelect({ question }: { question: SignificanceQuestion | null }) {
  if (question === null) return null
  return (
    <SelectField
      label={question.question}
      name="significant"
      options={ANSWERS}
      defaultValue=""
      required
      hint={question.help ?? undefined}
    />
  )
}
