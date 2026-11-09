import type { Metadata } from 'next'
import { ReportReceived, reportReference } from '@/components/public/ReportReceived'

export const metadata: Metadata = { title: 'Report received' }

export default async function ReceivedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const { ref } = await searchParams
  return <ReportReceived reference={reportReference(ref)} reply="anonymous" />
}
