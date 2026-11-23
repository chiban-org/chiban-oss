import { Suspense } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import { type LetterChoice, lettersFor, mayPrintLetters } from '@/features/templates/printLetter'
import { requireStaffContext } from '@/server/requireStaff'
import { printLetterAction } from './printLetterActions'

export function LettersForm({
  applicationId,
  letters,
}: {
  applicationId: string
  letters: readonly LetterChoice[]
}) {
  return (
    <section aria-label="Letters" id="print-letters">
      <h2>Letters</h2>
      <p className="text-muted-foreground">
        Print a letter from the templates for this kind of application. Chiban fills it in from this
        application and adds it to the documents. Lines shown as ____ are left for you to fill in by
        hand.
      </p>
      <ActionForm
        action={printLetterAction}
        submitLabel="Print the letter"
        variant="outline"
        className="max-w-md"
      >
        <input type="hidden" name="applicationId" value={applicationId} />
        <SelectField
          label="Letter"
          name="templateKey"
          options={letters.map((l) => [l.key, l.label] as const)}
          required
        />
      </ActionForm>
    </section>
  )
}

export async function LoadedLetters({ applicationId }: { applicationId: string }) {
  const { db, actor, signal } = await requireStaffContext()
  if (!(await mayPrintLetters(db, actor, applicationId, signal))) return null
  const letters = await lettersFor(db, applicationId, signal)
  if (letters.length === 0) return null
  return <LettersForm applicationId={applicationId} letters={letters} />
}

export function PrintLetterPanel({ applicationId }: { applicationId: string }) {
  return (
    <Suspense fallback={null}>
      <LoadedLetters applicationId={applicationId} />
    </Suspense>
  )
}
