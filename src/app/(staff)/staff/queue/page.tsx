import { permanentRedirect } from 'next/navigation'
import type { RawSearchParams } from '@/features/dataTable/params'
import { queueRedirectHref } from '@/features/queue/queueRedirect'
import { requireStaffActor } from '@/server/requireStaff'

const TIMEOUT_MS = 10_000

export default async function QueueRedirect({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}): Promise<never> {
  await requireStaffActor(AbortSignal.timeout(TIMEOUT_MS))
  permanentRedirect(queueRedirectHref(await searchParams))
}
