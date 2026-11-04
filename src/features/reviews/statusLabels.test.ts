import { describe, expect, it } from 'vitest'
import { reviewChipStatus, reviewStatusLabel } from '@/features/reviews/statusLabels'

describe('review status', () => {
  it('shows a signed-off review as passed and an open one as neutral', () => {
    expect(reviewChipStatus('signed_off')).toBe('passed')
    expect(reviewChipStatus('pending')).toBe('neutral')
    expect(reviewChipStatus('commented')).toBe('neutral')
  })

  it('marks an overdue review whatever its status', () => {
    expect(reviewChipStatus('pending', true)).toBe('overdue')
  })

  it('labels each status in plain words', () => {
    expect(reviewStatusLabel('signed_off')).toBe('Signed off')
  })
})
