import { describe, expect, it } from 'vitest'
import { LocalCodeAmendmentBodySchema } from '@/features/config/kinds'

const OLD_BODY = {
  title: 'Snow load for roofs',
  codeSection: 'IRC R301.2',
  adoptingAuthority: 'Town Meeting',
  adoptedOn: '2027-03-09',
  reviewBoardConfirmedOn: null,
}

describe('LocalCodeAmendmentBodySchema', () => {
  it('accepts a body saved before the text fields existed', () => {
    const parsed = LocalCodeAmendmentBodySchema.safeParse(OLD_BODY)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(OLD_BODY)
  })

  it('accepts and keeps the state text and the town text', () => {
    const body = {
      ...OLD_BODY,
      stateText: 'As the state writes it.',
      townText: 'As the town amended it.',
    }
    expect(LocalCodeAmendmentBodySchema.parse(body)).toEqual(body)
  })

  it('accepts the town text without the state text', () => {
    expect(
      LocalCodeAmendmentBodySchema.safeParse({ ...OLD_BODY, townText: 'New rule.' }).success,
    ).toBe(true)
  })

  it('rejects text that is not a string', () => {
    expect(LocalCodeAmendmentBodySchema.safeParse({ ...OLD_BODY, townText: 5 }).success).toBe(false)
  })
})
