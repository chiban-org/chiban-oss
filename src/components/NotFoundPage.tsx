import Link from 'next/link'

const LINK = 'tap-target inline-flex items-center text-lg underline'

export function NotFoundPage() {
  return (
    <div className="public-shell mx-auto flex min-h-screen max-w-[var(--content-max-width)] flex-col justify-center px-4 py-6">
      <main>
        <h1>Page not found</h1>
        <p>We could not find that page. It may have moved, or the address may be mistyped.</p>
        <ul className="mt-4 space-y-2">
          <li>
            <Link href="/" className={LINK}>
              Go to the home page
            </Link>
          </li>
          <li>
            <Link href="/parcels" className={LINK}>
              Look up a parcel
            </Link>
          </li>
        </ul>
      </main>
    </div>
  )
}
