import type { ItemCase, PacketAgendaItem } from '@/features/boards/packetCases'
import type { PacketView, PacketViewItem } from '@/features/boards/packetView'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { formatCivilDate } from '@/lib/formatDate'

type CoverItem = PacketViewItem & Partial<Pick<ItemCase, 'agendaItemId'>>

export type CoverView = Omit<PacketView, 'items'> & {
  agenda?: readonly PacketAgendaItem[]
  items: readonly CoverItem[]
}

function contentsOrder(view: CoverView): CoverItem[] {
  const agenda = view.agenda ?? []
  const rank = (item: CoverItem): number => {
    const at = agenda.findIndex((a) => a.id === item.agendaItemId)
    return at === -1 ? agenda.length : at
  }
  return view.items
    .filter((item) => item.withdrawnOn === null)
    .map((item, i) => ({ item, i, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ item }) => item)
}

export function packetCoverInput(view: CoverView, frame: DocumentFrame): DocumentInput {
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
              rows: contentsOrder(view).map((item, i) => [String(i + 1), item.title]),
            },
          ],
        ],
      ]),
    },
  }
}

export async function packetCoverPdf(
  view: CoverView,
  frame: DocumentFrame,
  template: TemplateBody | null = null,
): Promise<Uint8Array> {
  return await renderDocumentOrDefault(
    'board_packet_cover',
    template,
    packetCoverInput(view, frame),
  )
}
