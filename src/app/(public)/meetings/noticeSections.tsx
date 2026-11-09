import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { formatMinuteOfDay } from '@/features/hearings/labels'
import type { PublicHearingNotice } from '@/features/hearings/publicNotices'
import { formatCivilDate, formatCivilDateWithWeekday } from '@/lib/formatDate'

function whenAndWhere(notice: PublicHearingNotice): string {
  const where = notice.location === '' ? '' : `, ${notice.location}`
  return `${formatCivilDateWithWeekday(notice.meetingDate)} at ${formatMinuteOfDay(notice.startsAtMinute)}${where}`
}

function Subject({ notice }: { notice: PublicHearingNotice }) {
  const applicant = notice.applicantName === '' ? '' : ` Applicant ${notice.applicantName}.`
  const address = notice.parcelAddress === '' ? '' : ` ${notice.parcelAddress}.`
  return (
    <p className="m-0">{`${notice.kindLabel} on application ${notice.applicationNumber}.${address}${applicant}`}</p>
  )
}

function WithdrawnRow({ notice }: { notice: PublicHearingNotice }) {
  return (
    <li className="record-item flex flex-col gap-1 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{notice.boardShortName}</span>
        <StatusChip status="neutral" label="Withdrawn" />
      </div>
      <span>{formatCivilDate(notice.meetingDate)}</span>
      <p className="m-0 text-ink-secondary">
        {`The application ${notice.applicationNumber} was withdrawn. This hearing will not be held.`}
      </p>
    </li>
  )
}

export function HearingNoticeRow({ notice }: { notice: PublicHearingNotice }) {
  if (notice.withdrawn) return <WithdrawnRow notice={notice} />
  const name = `Printable notice: ${notice.boardShortName}, ${formatCivilDate(notice.meetingDate)}`
  return (
    <li className="record-item flex flex-col gap-2 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{notice.boardShortName}</span>
        {notice.continuedFromDate === null ? null : (
          <StatusChip
            status="neutral"
            label={`Continued from ${formatCivilDate(notice.continuedFromDate)}`}
          />
        )}
      </div>
      <span>{whenAndWhere(notice)}</span>
      <Subject notice={notice} />
      <div className="flex flex-col gap-2 text-ink-secondary">
        {notice.paragraphs.map((p) => (
          <p key={p} className="m-0">
            {p}
          </p>
        ))}
      </div>
      <a
        {...NEW_TAB}
        href={`/meetings/notices/${notice.hearingId}`}
        aria-label={name}
        className="tap-target inline-flex items-center self-start"
      >
        Printable notice (PDF)
      </a>
    </li>
  )
}
