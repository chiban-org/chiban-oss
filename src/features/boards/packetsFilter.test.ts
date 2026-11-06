import { describe, expect, it } from 'vitest'
import {
  filterPacketRows,
  readPacketsFilter,
  UNSENT_PACKETS_HREF,
} from '@/features/boards/packetsFilter'

const rows = [
  { meetingId: 'draft', needsWork: true },
  { meetingId: 'sent', needsWork: false },
  { meetingId: 'changed', needsWork: true },
]

describe('the board packets filter', () => {
  it('keeps only the packets not sent yet when the link asks for them', () => {
    const filter = readPacketsFilter({ packet: 'unsent' })
    expect(filterPacketRows(rows, filter).map((r) => r.meetingId)).toEqual(['draft', 'changed'])
    expect(UNSENT_PACKETS_HREF).toBe('/staff/boards/packets?packet=unsent')
  })

  it('keeps every row without the filter or with a value it does not know', () => {
    expect(filterPacketRows(rows, readPacketsFilter({}))).toHaveLength(3)
    expect(filterPacketRows(rows, readPacketsFilter({ packet: 'other' }))).toHaveLength(3)
  })
})
