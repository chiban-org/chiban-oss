const LINK = 'tap-target inline-flex items-center'

interface PublicPagerProps {
  label: string
  page: number
  hasNext: boolean
  hrefFor: (page: number) => string
  newer: string
  older: string
}

export function PublicPager({ label, page, hasNext, hrefFor, newer, older }: PublicPagerProps) {
  if (page === 1 && !hasNext) return null
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap gap-6">
      {page > 1 ? (
        <a href={hrefFor(page - 1)} className={LINK}>
          {newer}
        </a>
      ) : null}
      {hasNext ? (
        <a href={hrefFor(page + 1)} className={LINK}>
          {older}
        </a>
      ) : null}
    </nav>
  )
}
