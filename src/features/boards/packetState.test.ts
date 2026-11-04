import { describe, expect, it } from 'vitest'
import { packetStateOf } from '@/features/boards/packetState'
import type { CivilDate } from '@/types/civilDate'

const BASE = {
  cancelled: false,
  agendaPublished: true,
  hasPacket: true,
  sentOn: null,
  pending: 0,
  members: 0,
  outside: 0,
}
const SENT_ON = '2027-04-02' as CivilDate

describe('packet state label', () => {
  it('names each state in plain words', () => {
    expect(packetStateOf({ ...BASE, agendaPublished: false, hasPacket: false }).label).toBe(
      'Publish the agenda to start the packet',
    )
    expect(packetStateOf({ ...BASE, hasPacket: false }).label).toBe('Not sent yet')
    expect(packetStateOf(BASE).label).toBe('Not sent yet')
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, members: 5 }).label).toBe(
      'Sent to 5 members on April 2, 2027',
    )
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, members: 5, pending: 2 }).label).toBe(
      '2 changes not sent yet',
    )
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, members: 5, pending: 1 }).label).toBe(
      '1 change not sent yet',
    )
    expect(packetStateOf({ ...BASE, cancelled: true, sentOn: SENT_ON }).label).toBe(
      'Meeting cancelled. Packet closed.',
    )
  })

  it('says who it went to when no member has it yet', () => {
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, outside: 1 }).label).toBe(
      'Sent to 1 person outside the board on April 2, 2027',
    )
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, members: 1 }).label).toBe(
      'Sent to 1 member on April 2, 2027',
    )
  })

  it('needs work while it is unsent or has changes not sent', () => {
    expect(packetStateOf(BASE).needsWork).toBe(true)
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, members: 5 }).needsWork).toBe(false)
    expect(packetStateOf({ ...BASE, sentOn: SENT_ON, pending: 1 }).needsWork).toBe(true)
    expect(packetStateOf({ ...BASE, cancelled: true }).needsWork).toBe(false)
  })
})
