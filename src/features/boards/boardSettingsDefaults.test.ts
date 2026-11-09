import { describe, expect, it } from 'vitest'
import { boardSettingsDefault } from '@/features/boards/boardSettingsSchema'
import { demoBoardSettings } from '@/features/demo/demoBoardNotices'

const BOARDS = [
  { id: '00000000-0000-4000-8000-000000000001', kind: 'zba' as const },
  { id: '00000000-0000-4000-8000-000000000002', kind: 'planning_board' as const },
  { id: '00000000-0000-4000-8000-000000000003', kind: 'conservation_commission' as const },
]

describe('board settings defaults', () => {
  it('name no newspaper or bulletin board for a real install', () => {
    const body = boardSettingsDefault(BOARDS)
    expect(JSON.stringify(body)).not.toContain('Alder Pond')
    for (const entry of body.boards) {
      expect(entry.publicNotice.newspaper).toBeNull()
      expect(entry.publicNotice.bulletinBoards).toEqual([])
    }
    expect(body.boards[0]?.publicNotice).toMatchObject({ posting: true, publication: true })
  })

  it('keep the demo town notice places in the demo seed', () => {
    const body = demoBoardSettings(BOARDS)
    expect(body.boards[0]?.publicNotice.newspaper).toBe('Alder Pond Ledger')
    expect(body.boards[1]?.publicNotice.bulletinBoards).toEqual([
      'Alder Pond Town Hall bulletin board',
      'Alder Pond Public Library',
    ])
    expect(body.boards[2]?.publicNotice.bulletinBoards).toEqual([])
  })
})
