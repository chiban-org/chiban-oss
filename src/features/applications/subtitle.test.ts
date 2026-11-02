import { describe, expect, it } from 'vitest'
import { applicationSubtitle } from '@/features/applications/subtitle'

describe('applicationSubtitle', () => {
  it('does not repeat the type when the project title already starts with it', () => {
    expect(applicationSubtitle('Electrical permit', 'Electrical permit, 14 Heron Cove Road')).toBe(
      'Electrical permit, 14 Heron Cove Road',
    )
  })

  it('joins the type and a project title that does not start with it', () => {
    expect(applicationSubtitle('Building permit', 'Garage addition')).toBe(
      'Building permit for Garage addition',
    )
  })
})
