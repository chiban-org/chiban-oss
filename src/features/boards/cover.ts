import type { PacketView } from '@/features/boards/packetView'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { formatCivilDate } from '@/lib/formatDate'

export function packetCoverInput(view: PacketView, frame: DocumentFrame): DocumentInput {
  return {
    title: view.title,
    subtitle: `${view.boardShortName}, meeting ${formatCivilDate(view.meetingDate)}`,
    frame,
    context: {
      values: {
        'packet.title': view.title,
        'board.name': view.boardShortName,
        'board.short_name': view.boardShortName,
        'meeting.date': formatCivilDate(view.meetingDate),
      },
      sections: new Map([
        [
          'packet.contents',
          [
            {
              kind: 'table',
              columns: ['Item', 'Document'],
              rows: view.items
                .filter((item) => item.withdrawnOn === null)
                .map((item, i) => [String(i + 1), item.title]),
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
