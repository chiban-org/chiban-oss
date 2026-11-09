export const CONTENT_ID = 'content'

export function SkipLink() {
  return (
    <a
      href={`#${CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-ink focus:shadow"
    >
      Skip to content
    </a>
  )
}
