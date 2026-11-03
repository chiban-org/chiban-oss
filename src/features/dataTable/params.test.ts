import { describe, expect, it } from 'vitest'
import {
  clearHref,
  firstParam,
  pageHref,
  readOffset,
  readTableParams,
  tableHref,
} from '@/features/dataTable/params'

describe('readTableParams', () => {
  it('keeps repeated values, drops empty ones and missing keys', () => {
    expect(readTableParams({ a: 'x', b: ['y', '', 'z'], c: '', d: undefined })).toEqual(
      new Map([
        ['a', ['x']],
        ['b', ['y', 'z']],
      ]),
    )
  })

  it('reads the first value of a parameter', () => {
    expect(firstParam(readTableParams({ a: ['x', 'y'] }), 'a')).toBe('x')
    expect(firstParam(readTableParams({}), 'a')).toBeUndefined()
  })
})

describe('tableHref', () => {
  const params = readTableParams({ state: 'all', type: ['BP', 'EL'], cursor: '25' })

  it('applies a patch, repeats list values, and resets paging', () => {
    expect(tableHref('/t', params, { type: ['BP'], due: 'overdue' })).toBe(
      '/t?state=all&type=BP&due=overdue',
    )
  })

  it('removes a parameter patched to null or an empty list', () => {
    expect(tableHref('/t', params, { state: null, type: [] })).toBe('/t')
  })
})

describe('pageHref', () => {
  const params = readTableParams({ state: 'all', cursor: '25' })

  it('keeps every filter and sets the cursor', () => {
    expect(pageHref('/t', params, '50')).toBe('/t?state=all&cursor=50')
  })

  it('drops the cursor for the first page', () => {
    expect(pageHref('/t', params, '0')).toBe('/t?state=all')
    expect(pageHref('/t', readTableParams({}), null)).toBe('/t')
  })
})

describe('readOffset', () => {
  it('reads a non-negative whole offset and ignores anything else', () => {
    expect(readOffset(readTableParams({ cursor: '50' }))).toBe(50)
    expect(readOffset(readTableParams({ cursor: '-5' }))).toBe(0)
    expect(readOffset(readTableParams({ cursor: 'abc' }))).toBe(0)
    expect(readOffset(readTableParams({ cursor: '2.5' }))).toBe(0)
    expect(readOffset(readTableParams({}))).toBe(0)
  })
})

describe('clearHref', () => {
  it('drops the named parameters and keeps the rest, or is null when none is set', () => {
    const params = readTableParams({ sort: 'number', due: 'week', q: '12' })
    expect(clearHref('/t', params, ['due', 'q', 'type'])).toBe('/t?sort=number')
    expect(clearHref('/t', params, ['type'])).toBeNull()
  })
})
