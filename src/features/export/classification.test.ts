import { getTableName, is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  EXPORT_ENTITIES,
  exportOrder,
  HASH_COLUMNS_ALLOWED,
  SECRET_COLUMN_PATTERN,
} from '@/features/export/entities'
import { EXCLUDED_TABLES } from '@/features/export/excluded'

const allTables = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => ({ table: t, config: getTableConfig(t) }))

const exportedNames = new Set(EXPORT_ENTITIES.map((e) => e.name))

describe('export classification', () => {
  it('every drizzle table is exported or excluded with a reason', () => {
    const unclassified = allTables
      .map((t) => t.config.name)
      .filter((name) => !exportedNames.has(name) && !(name in EXCLUDED_TABLES))
    expect(unclassified).toEqual([])
    for (const reason of Object.values(EXCLUDED_TABLES)) expect(reason.length).toBeGreaterThan(5)
  })

  it('no table is both exported and excluded', () => {
    const both = [...exportedNames].filter((n) => n in EXCLUDED_TABLES)
    expect(both).toEqual([])
  })

  it('every exported entity names a real table', () => {
    const real = new Set(allTables.map((t) => t.config.name))
    expect([...exportedNames].filter((n) => !real.has(n))).toEqual([])
  })

  it('every secret-shaped column is omitted', () => {
    const offenders: string[] = []
    for (const { config } of allTables) {
      if (config.name in EXCLUDED_TABLES) continue
      const entity = EXPORT_ENTITIES.find((e) => e.name === config.name)
      for (const column of config.columns) {
        const secretShaped =
          SECRET_COLUMN_PATTERN.test(column.name) && !HASH_COLUMNS_ALLOWED.includes(column.name)
        if (secretShaped && !entity?.omitColumns.includes(column.name)) {
          offenders.push(`${config.name}.${column.name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('every omitted column exists and every omitted required column has a fill', () => {
    for (const entity of EXPORT_ENTITIES) {
      const config = getTableConfig(entity.table)
      for (const omitted of entity.omitColumns) {
        const column = config.columns.find((c) => c.name === omitted)
        expect(column, `${entity.name}.${omitted}`).toBeDefined()
        if (column?.notNull === true && !column.hasDefault) {
          expect(entity.omitFill[omitted], `${entity.name}.${omitted}`).toBeDefined()
        }
      }
    }
  })

  it('every ref names an exported entity and an existing column', () => {
    for (const entity of EXPORT_ENTITIES) {
      const columns = new Set(getTableConfig(entity.table).columns.map((c) => c.name))
      for (const ref of entity.refs) {
        expect(columns.has(ref.column), `${entity.name}.${ref.column}`).toBe(true)
        expect(exportedNames.has(ref.entity), `${entity.name} -> ${ref.entity}`).toBe(true)
      }
      for (const poly of entity.polyRefs) {
        expect(columns.has(poly.kindColumn)).toBe(true)
        expect(columns.has(poly.idColumn)).toBe(true)
        for (const target of Object.values(poly.map)) expect(exportedNames.has(target)).toBe(true)
      }
    }
  })

  it('export order puts parcels before parcel_aliases and applications before ledger_allocations', () => {
    const order = exportOrder(EXPORT_ENTITIES).map((e) => e.name)
    expect(order.indexOf('parcels')).toBeLessThan(order.indexOf('parcel_aliases'))
    expect(order.indexOf('applications')).toBeLessThan(order.indexOf('ledger_allocations'))
    expect(order.indexOf('projects')).toBeLessThan(order.indexOf('applications'))
    expect(new Set(order).size).toBe(EXPORT_ENTITIES.length)
  })

  it('every entity has a unique file path under data/', () => {
    const files = EXPORT_ENTITIES.map((e) => e.file)
    expect(new Set(files).size).toBe(files.length)
    for (const f of files) expect(f).toMatch(/^data\/[a-z_]+\.ndjson$/)
    expect(getTableName(EXPORT_ENTITIES[0]!.table)).toBe(EXPORT_ENTITIES[0]!.name)
  })
})
