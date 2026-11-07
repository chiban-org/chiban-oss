import { describe, expect, it } from 'vitest'
import { boardSettingsDefault } from '@/features/boards/boardSettings'
import { reconcileBoardSettings } from '@/features/boards/boardSettingsSchema'

const PLANNING = { id: '11111111-1111-4111-8111-111111111111', kind: 'planning_board' } as const
const ZBA = { id: '22222222-2222-4222-8222-222222222222', kind: 'zba' } as const
const CONSERVATION = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'conservation_commission',
} as const

describe('reconcileBoardSettings', () => {
  it('adds a section for a newly added board and keeps existing entries as they are', () => {
    const body = boardSettingsDefault([PLANNING, ZBA])
    const edited = {
      ...body,
      boards: body.boards.map((b) => ({
        ...b,
        publicNotice: { ...b.publicNotice, newspaper: 'Kept' },
      })),
    }
    const next = reconcileBoardSettings(edited, [PLANNING, ZBA, CONSERVATION])
    expect(next.boards.map((b) => b.boardId)).toEqual([PLANNING.id, ZBA.id, CONSERVATION.id])
    expect(next.boards[0]?.publicNotice.newspaper).toBe('Kept')
  })

  it('drops the section of an archived board', () => {
    const body = boardSettingsDefault([PLANNING, ZBA, CONSERVATION])
    const next = reconcileBoardSettings(body, [PLANNING, ZBA])
    expect(next.boards.map((b) => b.boardId)).toEqual([PLANNING.id, ZBA.id])
  })
})
