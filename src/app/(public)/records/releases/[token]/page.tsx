import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { openRelease } from '@/features/rtk/releaseLinks'
import { formatCivilDate } from '@/lib/formatDate'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const LINK = 'tap-target inline-flex items-center text-base underline'

export default async function ReleasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const opened = await openRelease(db, token, new Date(), AbortSignal.timeout(TIMEOUT_MS))
  if (!opened.ok && opened.error === 'invalid') notFound()
  if (!opened.ok) {
    return (
      <main className="space-y-4">
        <meta name="robots" content="noindex" />
        <h1>This link has expired</h1>
        <p className="text-base">This link has expired. Ask the land use office for a new one.</p>
      </main>
    )
  }
  const release = opened.value
  const base = `/records/releases/${token}/documents`
  return (
    <main className="space-y-4">
      <meta name="robots" content="noindex" />
      <h1>{`Records for request ${release.requestNumber}`}</h1>
      <p className="text-base">{`Released on ${formatCivilDate(release.releasedOn)}. Release ${release.sequence}.`}</p>
      <ul className="m-0 list-none space-y-2 p-0">
        {release.items.map((item) => (
          <li key={item.versionId} className="text-base">
            {item.withdrawnOn === null ? (
              <Link href={`${base}/${item.versionId}`} className={LINK}>
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
