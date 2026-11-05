import { ClockCard } from '@/components/clocks/ClockCard'
import { NoticeDeadlineCard } from '@/components/notices/NoticeDeadlineCard'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { expandedClocks, isOpen, sortClocks } from '@/features/clocks/clockSummary'
import { ClockAdjustForm } from './panels'

export function noDeadlines(view: StaffApplicationView): boolean {
  return view.clocks.length === 0 && view.noticeDeadlines.length === 0
}

export function ClocksPanel({ view }: { view: StaffApplicationView }) {
  const expanded = expandedClocks(view.clocks)
  return (
    <section aria-label="Clocks" id="clocks">
      <h2>Clocks</h2>
      {noDeadlines(view) ? <p>No clock is running on this application.</p> : null}
      {view.noticeDeadlines.map((deadline) => (
        <NoticeDeadlineCard key={deadline.hearingId} deadline={deadline} />
      ))}
      {sortClocks(view.clocks).map((clock) => (
        <ClockCard key={clock.clockId} clock={clock} collapsed={!expanded.has(clock)}>
          {isOpen(clock) ? (
            <ClockAdjustForm
              view={view}
              clockId={clock.clockId}
              allowedKinds={clock.allowedAdjustments}
            />
          ) : null}
        </ClockCard>
      ))}
    </section>
  )
}
