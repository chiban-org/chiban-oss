import { describe, expect, it } from 'vitest'
import { RegionalContactsBodySchema } from '@/features/boards/regionalContactsSchema'

const OLD_BODY = {
  key: 'default',
  commission: null,
  nhDes: null,
  municipalities: [
    { key: 'pine_river', name: 'Town of Pine River', mailingAddress: '4 Hall Road' },
  ],
}

describe('RegionalContactsBodySchema', () => {
  it('reads a body saved before the receipt contacts existed', () => {
    const parsed = RegionalContactsBodySchema.parse(OLD_BODY)
    expect(parsed.waterSuppliers).toEqual([])
    expect(parsed.municipalities[0]?.clerk).toBeUndefined()
  })

  it('reads a clerk, a reviewing authority and water suppliers', () => {
    const parsed = RegionalContactsBodySchema.parse({
      ...OLD_BODY,
      municipalities: [
        {
          ...OLD_BODY.municipalities[0],
          clerk: { name: 'Pine River Town Clerk', mailingAddress: '4 Hall Road' },
          reviewingAuthority: { name: 'Pine River Planning Board', mailingAddress: '6 Board Lane' },
        },
      ],
      waterSuppliers: [
        { key: 'lakeside', name: 'Lakeside Water District', mailingAddress: '2 Pump Road' },
      ],
    })
    expect(parsed.municipalities[0]?.clerk?.name).toBe('Pine River Town Clerk')
    expect(parsed.waterSuppliers).toHaveLength(1)
  })

  it('rejects a clerk with no address', () => {
    const parsed = RegionalContactsBodySchema.safeParse({
      ...OLD_BODY,
      municipalities: [
        { ...OLD_BODY.municipalities[0], clerk: { name: 'Clerk', mailingAddress: '' } },
      ],
    })
    expect(parsed.success).toBe(false)
  })
})
