import { DescriptionList } from '@/components/ui/description-list'
import type { CounterIntakeView } from '@/features/counter/intake/intakeView'
import { formatInstant } from '@/lib/formatDate'

function applicantLine(view: CounterIntakeView): string {
  const { name, email, hasAccount } = view.applicant
  if (hasAccount) return `${name}, ${email ?? ''}, has an account`
  return email === null ? `${name}, no email on file` : `${name}, ${email}, no account`
}

export function IntakeSummary({ view, zone }: { view: CounterIntakeView; zone: string }) {
  return (
    <DescriptionList
      items={[
        { label: 'Number', value: view.number },
        { label: 'Parcel', value: view.parcelLabel === '' ? 'Parcel on file' : view.parcelLabel },
        { label: 'Applicant', value: applicantLine(view) },
        {
          label: 'Taken by',
          value: `${view.takenByName}, ${formatInstant(view.takenAt, zone)}`,
        },
      ]}
    />
  )
}
