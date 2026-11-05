import { redirect } from 'next/navigation'
import { packetHref } from '@/features/boards/packetsIndex'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

export default async function PacketRedirect({
  params,
}: {
  params: Promise<{ packetId: string }>
}) {
  const { packetId } = await params
  const ctx = await requireStaffContext()
  redirect(await packetHref(ctx.db, packetId))
}
