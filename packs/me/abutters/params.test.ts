import { describe, expect, it } from 'vitest'
import { type BoardSettingsBody, boardSettingsDefault } from '@/features/boards/boardSettings'
import { checkBoardSettings } from '@/features/boards/boardSettingsChecks'
import { withPackForTest } from '@/features/packs/registry'
import { ME_PACK } from '../index'

function withBuffer(bufferFt: number): BoardSettingsBody {
  const body = boardSettingsDefault([])
  return { ...body, abutters: { ...body.abutters, bufferFt } }
}

describe('the Maine town buffer', () => {
  it('accepts a buffer up to 1000 feet', () => {
    withPackForTest(ME_PACK, () => {
      expect(checkBoardSettings(withBuffer(1000), [])).toBeNull()
    })
  })

  it('refuses a larger buffer as a Chiban limit, not a rule of state law', () => {
    withPackForTest(ME_PACK, () => {
      expect(checkBoardSettings(withBuffer(1001), [])).toEqual({
        invalid: [
          {
            path: 'abutters.bufferFt',
            message: 'Chiban limits this distance to at most 1000 feet.',
          },
        ],
      })
    })
  })
})
