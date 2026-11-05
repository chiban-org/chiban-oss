import Link from 'next/link'

export function InspectorPicker({
  inspectors,
  href,
}: {
  inspectors: readonly { userId: string; name: string }[]
  href: (userId: string) => string
}) {
  return (
    <main className="public-shell mx-auto max-w-xl space-y-4">
      <h1>Inspector day lists</h1>
      {inspectors.length === 0 ? (
        <p>No inspectors are set up yet.</p>
      ) : (
        <>
          <p>Choose an inspector to see their day.</p>
          <nav aria-label="Inspectors">
            <ul className="m-0 flex list-none flex-col p-0">
              {inspectors.map((i) => (
                <li key={i.userId}>
                  <Link href={href(i.userId)} className="inline-flex min-h-11 items-center">
                    {i.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </main>
  )
}
