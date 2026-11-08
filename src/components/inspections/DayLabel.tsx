import { shortDay } from '@/components/inspections/boardModel'

export function DayLabel({
  date,
  today,
  preferred,
}: {
  date: string
  today: boolean
  preferred: boolean
}) {
  return (
    <>
      <span className="block">{shortDay(date)}</span>
      {today ? <span className="block font-normal text-muted-foreground">Today</span> : null}
      {preferred ? <span className="block font-semibold text-action">Preferred day</span> : null}
    </>
  )
}
