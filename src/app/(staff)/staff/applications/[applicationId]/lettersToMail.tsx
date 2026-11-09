import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { TextField } from '@/components/staff/fields'
import type { LetterToMail } from '@/features/decisions/letterDelivery'
import { formatCivilDate } from '@/lib/formatDate'
import { recordLetterMailedAction } from './letterActions'
import type { LettersData } from './lettersData'

function MailedStatus({ letter, data }: { letter: LetterToMail; data: LettersData }) {
  if (letter.mailedOn !== null) {
    return <p className="text-ink-secondary">{`Mailed ${formatCivilDate(letter.mailedOn)}.`}</p>
  }
  if (!data.canRecord) return <p className="text-ink-secondary">Not mailed yet.</p>
  return (
    <ActionForm
      action={recordLetterMailedAction}
      submitLabel="Record mailed"
      variant="outline"
      className="max-w-md"
    >
      <input type="hidden" name="mailingId" value={letter.id} />
      <TextField
        label="Date mailed"
        name="mailedOn"
        type="date"
        defaultValue={data.today}
        max={data.today}
        required
      />
    </ActionForm>
  )
}

function LetterRow({ letter, data }: { letter: LetterToMail; data: LettersData }) {
  return (
    <li className="record-item flex flex-col gap-2 [&>*]:m-0">
      <p>
        <span className="font-semibold">{letter.partyName}</span>
        {`, ${letter.partyRole}`}
      </p>
      <p>
        <a {...NEW_TAB} href={`/api/documents/${letter.documentId}`}>
          {`Print ${letter.documentTitle}`}
        </a>
      </p>
      <MailedStatus letter={letter} data={data} />
    </li>
  )
}

export function LettersToMail({ data }: { data: LettersData }) {
  if (data.letters.length === 0) return null
  return (
    <section aria-label="Decision letters to mail" id="letters-to-mail">
      <h2>Decision letters to mail</h2>
      <p className="text-muted-foreground">
        These parties have no email address or account the town can send the decision to. Print the
        letter, mail it, and record the date it went out.
      </p>
      <ul className="m-0 list-none p-0">
        {data.letters.map((letter) => (
          <LetterRow key={letter.id} letter={letter} data={data} />
        ))}
      </ul>
    </section>
  )
}
