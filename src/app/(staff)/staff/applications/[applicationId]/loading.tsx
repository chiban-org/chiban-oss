function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-status-neutral-bg ${className}`} />
}

function PanelSkeleton({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-hairline bg-surface p-6">
      <Bar className="h-6 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Bar key={i} className={i % 2 === 0 ? 'h-4 w-full' : 'h-4 w-2/3'} />
      ))}
    </div>
  )
}

export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading the application" className="animate-pulse">
      <div className="mb-8 flex flex-col gap-3 border-b pb-8">
        <Bar className="h-4 w-48" />
        <div className="flex items-center gap-4">
          <Bar className="h-8 w-44" />
          <Bar className="h-7 w-28" />
        </div>
        <Bar className="h-5 w-80 max-w-full" />
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
        <div className="mb-6 flex flex-col gap-6 lg:order-2 lg:mb-0">
          <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-hairline bg-surface p-5">
            <Bar className="h-4 w-20" />
            <Bar className="h-9 w-full" />
          </div>
          <div className="hidden flex-col gap-3 rounded-[var(--radius)] border border-hairline bg-surface p-5 lg:flex">
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-32" />
            <Bar className="h-4 w-20" />
            <Bar className="h-4 w-28" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <PanelSkeleton lines={3} />
          <PanelSkeleton lines={5} />
          <PanelSkeleton lines={2} />
        </div>
      </div>
      <p className="sr-only" role="status">
        Loading the application
      </p>
    </main>
  )
}
