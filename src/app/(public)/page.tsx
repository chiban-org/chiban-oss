import type { Metadata } from 'next'
import { HomeContent } from '@/components/public/HomeContent'
import { isBoardMember } from '@/features/access/predicates'
import { getActor } from '@/server/getActor'

export const metadata: Metadata = { title: 'Home' }

const TIMEOUT_MS = 10_000

export default async function HomePage() {
  const actor = await getActor(AbortSignal.timeout(TIMEOUT_MS))
  const audience = actor === null ? 'visitor' : actor.kind === 'staff' ? 'staff' : 'resident'
  return <HomeContent audience={audience} boardMember={actor !== null && isBoardMember(actor)} />
}
