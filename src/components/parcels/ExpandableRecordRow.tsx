'use client'

import { ChevronDown } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { STACKED } from '@/components/parcels/stackedCell'
import { cn } from '@/lib/utils'

function filesText(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

export function ExpandableRecordRow({
  closed,
  fileCount,
  colSpan,
  cells,
  trailing,
  detail,
}: {
  closed: boolean
  fileCount: number
  colSpan: number
  cells: ReactNode
  trailing?: ReactNode
  detail: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return (
    <>
      <tr
        data-closed={closed ? '' : undefined}
        className={cn(
          'max-md:grid max-md:gap-y-1.5 max-md:px-4 max-md:py-3',
          closed ? 'text-muted-foreground' : undefined,
        )}
      >
        {cells}
        <td data-label="Files" className={cn(STACKED, fileCount === 0 ? 'max-md:hidden' : '')}>
          {fileCount === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 whitespace-nowrap text-action hover:underline"
            >
              {filesText(fileCount)}
              <ChevronDown
                aria-hidden={true}
                className={cn('size-4 transition-transform', open ? 'rotate-180' : undefined)}
              />
            </button>
          )}
        </td>
        {trailing}
      </tr>
      <tr id={detailId} hidden={!open} className="max-md:block">
        <td colSpan={colSpan} className="max-md:block max-md:px-4 max-md:pb-3">
          {detail}
        </td>
      </tr>
    </>
  )
}
