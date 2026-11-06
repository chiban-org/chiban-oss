import {
  filterPacketRows,
  PACKETS_PATH,
  UNSENT_PACKETS_HREF,
} from '@/features/boards/packetsFilter'
import { loadPacketsIndex } from '@/features/boards/packetsIndex'
import type { HomeContext, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

export async function loadPacketsSection(ctx: HomeContext): Promise<HomeSection | null> {
  if (!mayOpen(PACKETS_PATH, ctx.viewer)) return null
  const index = await loadPacketsIndex(ctx.db, ctx.actor, ctx.signal, ctx.now)
  if (!index.ok) return null
  const unsent = filterPacketRows(index.value.meetings, { unsentOnly: true }).length
  return {
    key: 'packets',
    title: 'Board packets',
    urgency: 0,
    rows: [
      {
        label: 'Packets for upcoming meetings not sent yet',
        count: unsent,
        href: UNSENT_PACKETS_HREF,
      },
    ],
    links: [{ label: 'Open board packets', href: PACKETS_PATH }],
    detail: null,
  }
}
