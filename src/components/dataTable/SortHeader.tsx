import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import Link from 'next/link'
import type { SortDir, SortLink } from '@/features/dataTable/sort'
import { cn } from '@/lib/utils'

function ariaSort(direction: SortDir | null): 'ascending' | 'descending' | undefined {
  if (direction === null) return undefined
  return direction === 'asc' ? 'ascending' : 'descending'
}

function SortIcon({ direction }: { direction: SortDir | null }) {
  if (direction === null) {
    return (
      <ChevronsUpDown
        aria-hidden={true}
        className="size-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100"
      />
    )
  }
  const Arrow = direction === 'asc' ? ArrowUp : ArrowDown
  return <Arrow aria-hidden={true} className="size-3.5 shrink-0 text-action" />
}

function HeaderLink({ label, link }: { label: string; link: SortLink | undefined }) {
  if (link === undefined) return label
  return (
    <Link
      href={link.href}
      className={cn(
        'group inline-flex items-center gap-1 rounded-sm text-ink no-underline hover:text-action',
        link.direction === null ? '' : 'text-action',
      )}
    >
      {label}
      <SortIcon direction={link.direction} />
    </Link>
  )
}

export interface SecondarySort {
  label: string
  link?: SortLink | undefined
}

export function SortHeader({
  label,
  link,
  className,
  secondary,
}: {
  label: string
  link?: SortLink | undefined
  className?: string
  secondary?: SecondarySort
}) {
  const direction = link?.direction ?? secondary?.link?.direction ?? null
  return (
    <th scope="col" aria-sort={ariaSort(direction)} className={className}>
      <HeaderLink label={label} link={link} />
      {secondary === undefined ? null : (
        <span className="mt-0.5 block font-normal">
          <HeaderLink label={secondary.label} link={secondary.link} />
        </span>
      )}
    </th>
  )
}

export interface SortOption {
  label: string
  link: SortLink
}

export function SortBar({ options, className }: { options: SortOption[]; className?: string }) {
  return (
    <nav
      aria-label="Sort"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}
    >
      <span className="font-semibold text-muted-foreground">Sort by</span>
      {options.map(({ label, link }) => (
        <Link
          key={label}
          href={link.href}
          aria-current={link.direction === null ? undefined : 'true'}
          className={cn(
            'inline-flex items-center gap-1 no-underline',
            link.direction === null ? 'text-ink' : 'font-semibold text-action',
          )}
        >
          {label}
          {link.direction === null ? null : (
            <>
              <span className="sr-only">{`, ${ariaSort(link.direction)}`}</span>
              <SortIcon direction={link.direction} />
            </>
          )}
        </Link>
      ))}
    </nav>
  )
}
