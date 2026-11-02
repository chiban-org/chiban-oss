import type { PacketView } from '@/features/boards/packetLinks'
import { renderPdf } from '@/features/pdf/renderPdf'
import { formatCivilDate } from '@/lib/formatDate'

const BOARD_NAMES = { planning_board: 'Planning Board', zba: 'Zoning Board of Adjustment' } as const

export async function packetCoverPdf(view: PacketView, townName: string): Promise<Uint8Array> {
  return await renderPdf({
    title: view.title,
    subtitle: `${BOARD_NAMES[view.board]}, meeting ${formatCivilDate(view.meetingDate)}`,
    townName,
    scale: 'document',
    blocks: [
      { kind: 'heading', text: 'Contents' },
      {
        kind: 'table',
        columns: ['Item', 'Document', 'File'],
        rows: view.items.map((item, i) => [String(i + 1), item.title, item.filename]),
      },
    ],
  })
}
