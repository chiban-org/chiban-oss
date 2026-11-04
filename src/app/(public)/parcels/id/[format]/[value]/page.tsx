import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { db } from '@/db/client'
import { resolveIdRoute } from '@/features/parcels/publicParcelView'

interface IdRedirectPageProps {
  params: Promise<{ format: string; value: string }>
}

const TIMEOUT_MS = 10_000

export default async function ParcelIdRedirectPage({ params }: IdRedirectPageProps) {
  const { format, value } = await params
  const route = await resolveIdRoute(db, format, value, AbortSignal.timeout(TIMEOUT_MS))
  if (route.kind === 'redirect') permanentRedirect(`/parcels/${route.parcelId}`)
  if (route.kind === 'not_found') notFound()
  return (
    <main className="text-base">
      <h1>Which parcel do you mean?</h1>
      <p>That ID was used by more than one parcel over time.</p>
      <ul>
        {route.choices.map((c) => (
          <li key={c.parcelId}>
            <Link href={`/parcels/${c.parcelId}`} className="tap-target">
              {c.displayId ?? 'Parcel'}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
