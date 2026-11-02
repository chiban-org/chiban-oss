import { HomeContent } from '@/components/public/HomeContent'
import { getActor } from '@/server/getActor'

const TIMEOUT_MS = 10_000

export default async function HomePage() {
  const actor = await getActor(AbortSignal.timeout(TIMEOUT_MS))
  const audience = actor === null ? 'visitor' : actor.kind === 'staff' ? 'staff' : 'resident'
  return <HomeContent audience={audience} />
}
