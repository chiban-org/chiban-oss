import { describe, expect, it } from 'vitest'
import { closingCopy } from './closingCopy'

describe('closingCopy', () => {
  it('says a passed final closes a permit that closes on its final', () => {
    expect(closingCopy(true, 'final_inspection_passed', 'EL-2026-0001')).toEqual({
      note: 'Passing this final closes permit EL-2026-0001.',
      confirm: 'This closes permit EL-2026-0001.',
    })
  })

  it('says a passed final leaves a building permit waiting for its certificate', () => {
    expect(closingCopy(true, 'certificate_of_occupancy', 'BP-2025-0001')).toEqual({
      note: 'Passing this final leaves permit BP-2025-0001 waiting for its certificate of occupancy.',
      confirm: 'Permit BP-2025-0001 then waits for its certificate of occupancy.',
    })
  })

  it('says nothing for an inspection that is not the final', () => {
    expect(closingCopy(false, 'final_inspection_passed', 'EL-2026-0001')).toBeNull()
  })
})
