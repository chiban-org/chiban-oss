import { describe, expect, it } from 'vitest'
import { primaryRoleLabel } from './roleLabels'

describe('primaryRoleLabel', () => {
  it('names the broadest role a person holds', () => {
    expect(primaryRoleLabel(['inspector', 'admin'])).toBe('Administrator')
    expect(primaryRoleLabel(['reviewer', 'staff'])).toBe('Land use staff')
  })

  it('falls back to Staff when no staff role is held', () => {
    expect(primaryRoleLabel([])).toBe('Staff')
  })
})
