import Link from 'next/link'
import { RecordRow, RecordRowLine, RecordRowLines } from '@/components/portal/RecordRow'
import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { stateLabel } from '@/features/applications/stateLabel'
import type {
  ContractorApplicationRow,
  ContractorProjectRow,
} from '@/features/contractors/dashboard'
import { honestText } from '@/features/honest/honest'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

const LINK = 'tap-target inline-flex items-center'

function nextDate(app: ContractorApplicationRow): string | null {
  const next = app.upcoming[0]
  if (next !== undefined)
    return `Next inspection: ${next.typeLabel.toLowerCase()}, ${formatCivilDate(next.date)}`
  return app.issuedOn === null ? null : `Issued ${formatCivilDate(app.issuedOn)}`
}

function ApplicationLine({ app }: { app: ContractorApplicationRow }) {
  const href = `/portal/applications/${app.applicationId}`
  const date = nextDate(app)
  const documents = app.missingDocuments.length
  return (
    <RecordRowLine>
      <Link href={href} className={LINK}>{`${app.typeLabel} ${app.number}`}</Link>
      <StatusChip status={applicationChipStatus(app.state)} label={stateLabel(app.state)} />
      {app.dueCents > 0 ? (
        <Link href={`${href}#fees-heading`} className={LINK}>
          {`Balance due ${formatCents(app.dueCents)}`}
        </Link>
      ) : null}
      {documents > 0 ? (
        <Link href={`${href}#documents-heading`} className={LINK}>
          {documents === 1 ? '1 document requested' : `${documents} documents requested`}
        </Link>
      ) : null}
      {date === null ? null : <span>{date}</span>}
      {app.resultsOwed.map((owed) => (
        <Link
          key={`${owed.date}-${owed.typeLabel}`}
          href={`${href}/inspections`}
          className={LINK}
        >{`No result recorded for the ${owed.typeLabel.toLowerCase()} inspection of ${formatCivilDate(owed.date)}`}</Link>
      ))}
    </RecordRowLine>
  )
}

export function ProjectRow({ row }: { row: ContractorProjectRow }) {
  const address = honestText(row.siteAddress, 'Address not on file')
  return (
    <RecordRow
      title={
        <>
          {address}
          <span className="block text-base font-normal text-ink-secondary">{row.title}</span>
        </>
      }
      detail={row.parcelDisplayId === null ? undefined : `Parcel ${row.parcelDisplayId}`}
    >
      {row.applications.length === 0 ? (
        <p className="m-0">No application has been filed on this project yet.</p>
      ) : (
        <RecordRowLines>
          {row.applications.map((app) => (
            <ApplicationLine key={app.applicationId} app={app} />
          ))}
        </RecordRowLines>
      )}
    </RecordRow>
  )
}
