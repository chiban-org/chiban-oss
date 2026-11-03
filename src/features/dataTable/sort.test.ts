import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import { parseSort, type SortConfig, sortLinks } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'

type Key = 'number' | 'due' | 'fees'

const CONFIG: SortConfig<Key> = {
  defaultKey: 'due',
  columns: { number: 'asc', due: 'asc', fees: 'desc' },
}

const parse = (raw: Record<string, string | string[] | undefined>) =>
  parseSort(CONFIG, readTableParams(raw))

describe('parseSort', () => {
  it('uses the default key and its direction when nothing is asked for', () => {
    expect(parse({})).toEqual({ key: 'due', dir: 'asc' })
  })

  it('accepts an allowed key with an explicit direction', () => {
    expect(parse({ sort: 'number', dir: 'desc' })).toEqual({ key: 'number', dir: 'desc' })
  })

  it('gives an allowed key its own first direction when dir is missing or unknown', () => {
    expect(parse({ sort: 'fees' })).toEqual({ key: 'fees', dir: 'desc' })
    expect(parse({ sort: 'fees', dir: 'sideways' })).toEqual({ key: 'fees', dir: 'desc' })
  })

  it('rejects an unknown key and falls back to the default', () => {
    expect(parse({ sort: 'password', dir: 'desc' })).toEqual({ key: 'due', dir: 'asc' })
    expect(parse({ sort: 'constructor' })).toEqual({ key: 'due', dir: 'asc' })
    expect(parse({ sort: '__proto__' })).toEqual({ key: 'due', dir: 'asc' })
  })

  it('reads the first value when a parameter repeats', () => {
    expect(parse({ sort: ['number', 'fees'], dir: ['desc', 'asc'] })).toEqual({
      key: 'number',
      dir: 'desc',
    })
  })
})

describe('sortLinks', () => {
  const params = readTableParams({ due: 'overdue', cursor: '25' })

  it('marks the active column and flips it, dropping the page cursor', () => {
    const links = sortLinks('/q', params, CONFIG, { key: 'due', dir: 'asc' })
    expect(links.due).toEqual({ href: '/q?due=overdue&sort=due&dir=desc', direction: 'asc' })
    expect(links.number).toEqual({
      href: '/q?due=overdue&sort=number&dir=asc',
      direction: null,
    })
    expect(links.fees.href).toBe('/q?due=overdue&sort=fees&dir=desc')
  })

  it('drops sort and dir from the link that returns to the default order', () => {
    const links = sortLinks('/q', params, CONFIG, { key: 'due', dir: 'desc' })
    expect(links.due).toEqual({ href: '/q?due=overdue', direction: 'desc' })
  })
})

describe('orderBySql', () => {
  const dialect = new PgDialect()
  const columns = { number: sql`n`, due: sql`d`, fees: sql`f` }
  const render = (dir: 'asc' | 'desc') =>
    orderBySql({ key: 'due', dir }, columns, [sql`id asc`]).map(
      (part) => dialect.sqlToQuery(part).sql,
    )

  it('keeps empty values last in both directions and ends on the tiebreak', () => {
    expect(render('asc')).toEqual(['d asc nulls last', 'id asc'])
    expect(render('desc')).toEqual(['d desc nulls last', 'id asc'])
  })
})
