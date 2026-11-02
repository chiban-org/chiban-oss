import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Town of Alder Pond</h1>
      <p>Find a parcel, see its permits and applications, and track what the town has on file.</p>
      <ul className="mt-4 space-y-2">
        <li>
          <Link href="/parcels" className="tap-target inline-flex items-center text-lg underline">
            Look up a parcel
          </Link>
        </li>
        <li>
          <Link href="/sign-in" className="tap-target inline-flex items-center text-lg underline">
            Sign in to see your applications
          </Link>
        </li>
      </ul>
    </main>
  )
}
