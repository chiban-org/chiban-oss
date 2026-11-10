import { demoNotice } from '@/features/demo/demoMode'

export function DemoBanner() {
  const notice = demoNotice()
  if (notice === null) return null
  return (
    <p
      role="note"
      data-slot="demo-banner"
      className="m-0 border-b border-dashed border-control-border bg-surface px-4 py-2 text-center text-base"
    >
      {notice}
    </p>
  )
}
