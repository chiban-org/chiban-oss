import Link from 'next/link'

export type HomeAudience = 'visitor' | 'resident' | 'staff'

const LINK = 'tap-target inline-flex items-center text-lg underline'

function AccountLink({ audience }: { audience: HomeAudience }) {
  if (audience === 'resident') {
    return (
      <Link href="/portal" className={LINK}>
        Your applications
      </Link>
    )
  }
  if (audience === 'staff') {
    return (
      <Link href="/staff" className={LINK}>
        Open the staff site
      </Link>
    )
  }
  return (
    <Link href="/sign-in" className={LINK}>
      Sign in to see your applications
    </Link>
  )
}

export function HomeContent({ audience }: { audience: HomeAudience }) {
  return (
    <main>
      <h1>Town of Alder Pond</h1>
      <p>Find a parcel, see its permits and applications, and track what the town has on file.</p>
      <ul className="mt-4 space-y-2">
        <li>
          <Link href="/parcels" className={LINK}>
            Look up a parcel
          </Link>
        </li>
        <li>
          <Link href="/complaints/new" className={LINK}>
            Report a possible violation
          </Link>
        </li>
        <li>
          <AccountLink audience={audience} />
        </li>
      </ul>
    </main>
  )
}
