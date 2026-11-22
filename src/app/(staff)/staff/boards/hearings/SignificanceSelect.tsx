import { SelectField } from '@/components/staff/fields'
import type { SignificanceQuestion } from '@/features/decisions/significance'

const ANSWERS: [string, string][] = [
  ['', 'Choose one'],
  ['yes', 'Yes'],
  ['no', 'No'],
]

function Facts({ facts }: { facts: NonNullable<SignificanceQuestion['facts']> }) {
  if (facts.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="m-0 text-sm">From the application:</p>
      <ul className="m-0 list-disc pl-5 text-sm">
        {facts.map((f) => (
          <li key={f.label}>{`${f.label}: ${f.value}`}</li>
        ))}
      </ul>
    </div>
  )
}

export function SignificanceSelect({ question }: { question: SignificanceQuestion | null }) {
  if (question === null) return null
  return (
    <>
      <Facts facts={question.facts ?? []} />
      <SelectField
        label={question.question}
        name="significant"
        options={ANSWERS}
        defaultValue=""
        required
        hint={question.help ?? undefined}
      />
    </>
  )
}
