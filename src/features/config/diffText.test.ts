import { describe, expect, it } from 'vitest'
import { describePath, describeValue } from '@/features/config/diffText'

describe('describePath', () => {
  it('turns a JSON pointer into a readable field description', () => {
    expect(describePath('/lines/0/expr/of/cents')).toBe('Lines, item 1, expr, of, amount')
    expect(describePath('/fields/2/label')).toBe('Fields, item 3, label')
    expect(describePath('/label')).toBe('Label')
  })
})

describe('describeValue', () => {
  it('shows cents as dollars when the path names an amount', () => {
    expect(describeValue('/lines/0/expr/of/cents', 5000)).toBe('$50.00')
    expect(describeValue('/lines/0/expr/of/cents', 4500)).toBe('$45.00')
  })

  it('shows other values plainly', () => {
    expect(describeValue('/label', 'Electrical permit')).toBe('Electrical permit')
    expect(describeValue('/enabled', true)).toBe('Yes')
    expect(describeValue('/label', undefined)).toBe('nothing')
    expect(describeValue('/x', { a: 1 })).toBe('{"a":1}')
  })
})
