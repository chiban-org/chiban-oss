import { SectionHeader } from '@/components/layout/ListHeader'
import { activePack } from '@/features/packs/registry'
import { formatCivilDate } from '@/lib/formatDate'

export function Holidays({ year }: { year: number }) {
  const pack = activePack()
  const holidays = [...pack.holidays(year), ...pack.holidays(year + 1)]
  return (
    <section aria-labelledby="holidays-skipped">
      <SectionHeader
        id="holidays-skipped"
        title="Holidays Chiban skips"
        lead="Chiban treats these as non-business days when it works out a deadline."
      />
      <div className="table-panel">
        <table className="w-full text-sm">
          <caption className="sr-only">{`Holidays for ${year} and ${year + 1}`}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Holiday</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => (
              <tr key={holiday.date}>
                <td>{formatCivilDate(holiday.date)}</td>
                <td>{holiday.name}</td>
                <td>{holiday.citation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
