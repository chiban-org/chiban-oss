import { describe, expect, it } from 'vitest'
import { type PacketItemRow, readerItems } from '@/features/boards/packetContents'

const FIRST = new Date('2027-04-01T15:00:00Z')
const UPDATE = new Date('2027-04-05T15:00:00Z')
const LATER = new Date('2027-04-07T15:00:00Z')

function row(documentId: string, extra: Partial<PacketItemRow> = {}): PacketItemRow {
  return {
    documentId,
    versionId: `v-${documentId}`,
    formerVersionId: null,
    position: 0,
    title: documentId,
    filename: `${documentId}.pdf`,
    sentAt: FIRST,
    removedAt: null,
    removalSentAt: null,
    replacesDocumentId: null,
    withdrawnAt: null,
    withdrawnReason: null,
    ...extra,
  }
}

const packet = { sentAt: FIRST, lastSentAt: UPDATE }

describe('what packet readers see', () => {
  it('hides additions that have not been sent and keeps removals that have not been sent', () => {
    const items = readerItems(
      [row('plan'), row('pending', { sentAt: null }), row('leaving', { removedAt: LATER })],
      packet,
    )
    expect(items.map((i) => [i.title, i.withdrawn])).toEqual([
      ['plan', null],
      ['leaving', null],
    ])
  })

  it('marks items sent in an update as added or replaced and drops the item a replacement took over', () => {
    const items = readerItems(
      [
        row('agenda 1', { removedAt: UPDATE, removalSentAt: UPDATE }),
        row('agenda 2', { sentAt: UPDATE, replacesDocumentId: 'agenda 1' }),
        row('letter', { sentAt: UPDATE }),
      ],
      packet,
    )
    expect(items.map((i) => [i.title, i.mark])).toEqual([
      ['agenda 2', 'replaced'],
      ['letter', 'added'],
    ])
  })

  it('keeps a sent removal and a revoked copy in the list with the reason', () => {
    const items = readerItems(
      [
        row('gone', { removedAt: UPDATE, removalSentAt: UPDATE }),
        row('revoked', { withdrawnAt: UPDATE, withdrawnReason: 'revoked' }),
      ],
      packet,
    )
    expect(items.map((i) => i.withdrawn?.why)).toEqual(['removed', 'revoked'])
  })
})
