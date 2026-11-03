import { PermitLookupForm } from '@/components/inspections/PermitLookupForm'
import { RequestForm } from '@/components/inspections/RequestForm'
import type { ScheduleBoardData } from '@/features/inspections/boardData'
import { requestableTypes } from '@/features/inspections/eligibility'
import {
  describeIntakeBlock,
  findIssuedApplicationByNumber,
  findReinspectionTarget,
} from '@/features/inspections/lookup'
import { describePhoneHours } from '@/features/inspections/phoneHours'
import { schedulingDates } from '@/features/inspections/slots'
import { packHolidayCalendar } from '@/features/packs/holidays'
import type { StaffContext } from '@/server/requireStaff'
import { requestInspectionAction } from './actions'

const NOTHING_TO_REQUEST =
  'Every inspection on this permit is already requested, scheduled, or passed.'

type Target = { id: string; number: string; state: string }
type Offered = { checklistVersionId: string; label: string }

export interface TakeRequestData {
  number: string
  target: Target | null
  blockedCopy: string | null
  offered: Offered[]
  reinspectionOf: string | null
}

async function offeredTypes(ctx: StaffContext, applicationId: string, reinspect: string) {
  const reinspection = await findReinspectionTarget(
    ctx.db,
    ctx.actor,
    applicationId,
    reinspect,
    ctx.signal,
  )
  if (reinspection !== null) return { offered: [reinspection], reinspection }
  return { offered: await requestableTypes(ctx.db, applicationId, ctx.signal), reinspection }
}

export async function loadTakeRequest(
  ctx: StaffContext,
  number: string,
  reinspect: string,
): Promise<TakeRequestData> {
  const empty = { number, target: null, blockedCopy: null, offered: [], reinspectionOf: null }
  if (number.trim() === '') return empty
  const target = await findIssuedApplicationByNumber(ctx.db, ctx.actor, number, ctx.signal)
  if (target === null) return empty
  const blockedCopy = await describeIntakeBlock(ctx.db, target, ctx.signal)
  const { offered, reinspection } = await offeredTypes(ctx, target.id, reinspect)
  return {
    number,
    target,
    blockedCopy,
    offered: offered.map((t) => ({ checklistVersionId: t.checklistVersionId, label: t.label })),
    reinspectionOf: reinspection?.inspectionId ?? null,
  }
}

function Outcome({ data, board }: { data: TakeRequestData; board: ScheduleBoardData }) {
  const { target } = data
  if (target === null) {
    return data.number.trim() === '' ? null : <p>No permit has that number.</p>
  }
  if (data.blockedCopy !== null) return <p>{data.blockedCopy}</p>
  if (data.offered.length === 0) return <p>{NOTHING_TO_REQUEST}</p>
  return (
    <RequestForm
      submitLabel="Record request"
      applicationId={target.id}
      types={data.offered}
      {...(data.reinspectionOf === null ? {} : { reinspectionOf: data.reinspectionOf })}
      dates={schedulingDates(board.settings, packHolidayCalendar(), board.today)}
      action={requestInspectionAction}
      channels={[
        { value: 'phone', label: 'Phone' },
        { value: 'counter', label: 'Counter' },
      ]}
      phoneHoursText={describePhoneHours(board.settings)}
      outsidePhoneHours={board.outsidePhoneHours}
    />
  )
}

export function TakeRequestSection({
  data,
  board,
}: {
  data: TakeRequestData
  board: ScheduleBoardData
}) {
  return (
    <section aria-label="Take a request" id="take-request" className="max-w-xl space-y-3">
      <h2>Take a request</h2>
      <PermitLookupForm number={data.number} />
      <Outcome data={data} board={board} />
    </section>
  )
}
