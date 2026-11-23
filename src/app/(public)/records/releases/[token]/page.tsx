import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { NEW_TAB } from '@/components/newTab'
import { db } from '@/db/client'
import { loadOfficeName } from '@/features/pdf/officeName'
import { openRelease } from '@/features/rtk/releaseLinks'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { todayInTimeZone } from '@/types/civilDate'

export const metadata: Metadata = { title: 'Records release' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center text-base'

export default async function ReleasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const opened = await openRelease(db, token, new Date(), signal)
  if (!opened.ok && opened.error === 'invalid') notFound()
  if (!opened.ok) {
    const office = await loadOfficeName(db, signal)
    return (
      <main className="space-y-4">
        <meta name="robots" content="noindex" />
        <h1>This link has expired</h1>
        <p className="text-base">{`This link has expired. Ask the ${office} for a new one.`}</p>
      </main>
    )
  }
  const release = opened.value
  const town = await getTownSettings(db, signal)
  const until = todayInTimeZone(town.ok ? town.value.timeZone : 'UTC', new Date(release.expiresAt))
  const base = `/records/releases/${token}/documents`
  return (
    <main className="space-y-4">
      <meta name="robots" content="noindex" />
      <h1>{`Records for request ${release.requestNumber}`}</h1>
      <p className="text-base">{`Released on ${formatCivilDate(release.releasedOn)}. Release ${release.sequence}.`}</p>
      <p className="text-base">{`This link works until ${formatCivilDate(until)}.`}</p>
      <ul className="list-none space-y-2 p-0">
        {release.items.map((item) => (
          <li key={item.versionId} className="text-base">
            {item.withdrawnOn === null ? (
              <Link {...NEW_TAB} href={`${base}/${item.versionId}`} className={LINK}>
                {item.downloadName}
              </Link>
            ) : (
              <span>{`${item.title}: withdrawn by the town on ${formatCivilDate(item.withdrawnOn)}`}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
