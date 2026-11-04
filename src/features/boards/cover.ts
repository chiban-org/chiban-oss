import type { PacketView } from '@/features/boards/packetView'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { formatCivilDate } from '@/lib/formatDate'

const BOARD_NAMES = { planning_board: 'Planning Board', zba: 'Zoning Board of Adjustment' } as const

export function packetCoverInput(view: PacketView, frame: DocumentFrame): DocumentInput {
  return {
    title: view.title,
    subtitle: `${BOARD_NAMES[view.board]}, meeting ${formatCivilDate(view.meetingDate)}`,
    frame,
    context: {
      values: {
        'packet.title': view.title,
        'board.name': BOARD_NAMES[view.board],
        'meeting.date': formatCivilDate(view.meetingDate),
      },
      sections: new Map([
        [
          'packet.contents',
          [
            {
              kind: 'table',
              columns: ['Item', 'Document'],
              rows: view.items.map((item, i) => [String(i + 1), item.title]),
            },
          ],
        ],
      ]),
    },
  }
}

export async function packetCoverPdf(
  view: PacketView,
  frame: DocumentFrame,
  template: TemplateBody | null = null,
): Promise<Uint8Array> {
  return await renderDocumentOrDefault(
    'board_packet_cover',
    template,
    packetCoverInput(view, frame),
  )
}
