'use client'

import { Search } from 'lucide-react'
import { useState } from 'react'
import { RailTip } from '@/components/staff/StaffNavBody'
import { RECORD_SEARCH_LABEL, RecordSearch } from './RecordSearch'

export function SidebarSearch({ rail, onExpand }: { rail: boolean; onExpand: () => void }) {
  const [focusOnOpen, setFocusOnOpen] = useState(false)
  if (!rail) return <RecordSearch autoFocus={focusOnOpen} />
  return (
    <RailTip label={RECORD_SEARCH_LABEL} rail={true}>
      <button
        type="button"
        aria-label={RECORD_SEARCH_LABEL}
        onClick={() => {
          setFocusOnOpen(true)
          onExpand()
        }}
        className="flex min-h-9 w-full cursor-pointer items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface/70 hover:text-ink"
      >
        <Search aria-hidden={true} className="size-4 text-muted-foreground" />
      </button>
    </RailTip>
  )
}
