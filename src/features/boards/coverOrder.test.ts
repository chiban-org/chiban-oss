import { describe, expect, it } from 'vitest'
import { packetCoverInput } from '@/features/boards/cover'
import { NO_CASE } from '@/features/boards/packetCases'
import type { PacketReaderView } from '@/features/boards/packetView'
import type { DocumentFrame } from '@/features/pdf/frame'
import type { CivilDate } from '@/types/civilDate'

function item(versionId: string, title: string, agendaItemId: string | null) {
  return {
    versionId,
    title,
    filename: `${versionId}.pdf`,
    mark: null,
    withdrawnOn: null,
    withdrawnWhy: null,
    ...NO_CASE,
    isAgenda: agendaItemId !== null,
    agendaItemId,
  }
}

const VIEW: PacketReaderView = {
  packetId: 'packet-1',
  title: 'May meeting packet',
  boardId: '22222222-2222-4222-8222-222222222222',
  boardName: 'Vellmora Planning Board',
  boardShortName: 'Planning Board',
  meetingDate: '2027-05-12' as CivilDate,
  place: null,
  expiresAt: '',
  expiresOn: null,
  agenda: [
    { id: 'agenda-1', number: 1, title: 'Fernhollow Road site plan' },
    { id: 'agenda-2', number: 2, title: 'Alder Pond subdivision' },
  ],
  items: [
    item('v1', 'Draft minutes of April 14', null),
    item('v2', 'Alder Pond subdivision plat', 'agenda-2'),
    item('v3', 'Fernhollow Road site plan narrative', 'agenda-1'),
    item('v4', 'Alder Pond traffic letter', 'agenda-2'),
  ],
}

function contents(view: PacketReaderView) {
  const input = packetCoverInput(view, {} as DocumentFrame)
  return input.context.sections?.get('packet.contents')?.[0]
}

describe('the packet cover contents', () => {
  it('orders documents by the agenda position of their case, then the rest', () => {
    expect(contents(VIEW)).toMatchObject({
      rows: [
        ['1', 'Fernhollow Road site plan narrative'],
        ['2', 'Alder Pond subdivision plat'],
        ['3', 'Alder Pond traffic letter'],
        ['4', 'Draft minutes of April 14'],
      ],
    })
  })

  it('leaves withdrawn documents off the contents', () => {
    const withdrawn = {
      ...VIEW,
      items: VIEW.items.map((i) =>
        i.versionId === 'v2' ? { ...i, withdrawnOn: '2027-05-01' as CivilDate } : i,
      ),
    }
    expect(contents(withdrawn)).toMatchObject({
      rows: [
        ['1', 'Fernhollow Road site plan narrative'],
        ['2', 'Alder Pond traffic letter'],
        ['3', 'Draft minutes of April 14'],
      ],
    })
  })
})
