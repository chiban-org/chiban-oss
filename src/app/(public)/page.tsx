import type { Metadata } from 'next'
import { HomeContent } from '@/components/public/HomeContent'
import { db } from '@/db/client'
import { isBoardMember } from '@/features/access/predicates'
import { searchExample } from '@/features/parcels/searchExample'
import { getActiveProcessor } from '@/features/payments/processorAccounts'
import { homeAudience } from '@/features/publicSite/navForViewer'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { loadPublicTown } from '@/features/town/publicTown'
import { getActor } from '@/server/getActor'

export const metadata: Metadata = { title: 'Home' }

const TIMEOUT_MS = 10_000

export default async function HomePage() {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const [actor, town, example, processor] = await Promise.all([
    getActor(signal),
    loadPublicTown(db, signal),
    searchExample(db, signal),
    getActiveProcessor(db, signal),
  ])
  const viewer =
    actor?.kind === 'staff'
      ? { ...actor, capabilities: (await loadNavViewer(db, actor, signal)).capabilities }
      : actor
  const audience = homeAudience(viewer)
  return (
    <HomeContent
      audience={audience}
      townName={town.name}
      example={example}
      boardMember={actor !== null && isBoardMember(actor)}
      onlinePayment={processor.state === 'known'}
    />
  )
}
