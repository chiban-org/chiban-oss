import type { Metadata } from 'next'
import { ReportReceived, reportReference } from '@/components/public/ReportReceived'

export const metadata: Metadata = { title: 'Report received' }

export default async function ComplaintReceivedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[]; reply?: string | string[] }>
}) {
  const { ref, reply } = await searchParams
  return (
    <main>
      <ReportReceived
        reference={reportReference(ref)}
        reply={reply === 'none' ? 'none' : 'contact'}
      />
    </main>
  )
}
