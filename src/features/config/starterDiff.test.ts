import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { starterDiff } from '@/features/config/starterDiff'

describe('starterDiff', () => {
  it('diff reports a changed fee rate at /lines/0/expr/of/of/of/0/centsPerUnit', () => {
    const upstream = NH_STARTERS.find((s) => s.id === 'nh.starter.building')?.feeSchedule
    if (upstream === undefined) throw new Error('missing starter')
    const town = structuredClone(upstream)
    const sum = (town.lines[0]?.expr as { of: { of: { of: { centsPerUnit: number }[] } } }).of.of
    const first = sum.of[0]
    if (first === undefined) throw new Error('shape')
    first.centsPerUnit = 50
    expect(starterDiff(town, upstream)).toEqual([
      { path: '/lines/0/expr/of/of/of/0/centsPerUnit', town: 50, upstream: 35 },
    ])
  })

  it('identical bodies have no diff', () => {
    expect(starterDiff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([])
  })

  it('reports added and removed keys and array length changes', () => {
    expect(starterDiff({ a: 1, c: [1, 2] }, { a: 1, b: 2, c: [1] })).toEqual([
      { path: '/b', town: undefined, upstream: 2 },
      { path: '/c/1', town: 2, upstream: undefined },
    ])
  })

  it('escapes slashes in keys per JSON pointer', () => {
    expect(starterDiff({ 'a/b': 1 }, { 'a/b': 2 })).toEqual([
      { path: '/a~1b', town: 1, upstream: 2 },
    ])
  })
})
