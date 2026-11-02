import { describe, expect, it } from 'vitest'
import {
  CAMA_ADAPTER_STATUS,
  type CamaMapping,
  DEFAULT_CAMA_COLUMNS,
  DEFAULT_CAMA_MAPPING,
} from '@/features/cama/mapping'
import { readCamaCsv } from '@/features/cama/readCamaCsv'

const HEADER = DEFAULT_CAMA_COLUMNS.join(',')

function csv(...rows: string[]): Uint8Array {
  return new TextEncoder().encode([HEADER, ...rows].join('\n'))
}

function rows(bytes: Uint8Array, mapping: CamaMapping = DEFAULT_CAMA_MAPPING) {
  const result = readCamaCsv(bytes, mapping)
  if (!result.ok) throw new Error(`read failed: ${result.error.detail}`)
  return result.value
}

describe('readCamaCsv', () => {
  it('is marked stubbed', () => {
    expect(CAMA_ADAPTER_STATUS).toBe('stubbed')
  })

  it('unpadded map and lot compose cama15', () => {
    const [row] = rows(
      csv('7,14,0,1,Quillfeather,,PO Box 1,,Alder Pond,NH,03999,12,Heron Cove Road'),
    )
    expect(row?.properties.id).toBe('007014000000001')
  })

  it('windows-1252 owner name decodes', () => {
    const text = csv('7,14,0,0,Désirée Larkspur,,PO Box 1,,Alder Pond,NH,03999,12,Heron Cove Road')
    const latin1 = Uint8Array.from(
      Array.from(new TextDecoder().decode(text), (ch) => ch.charCodeAt(0)),
    )
    const [row] = rows(latin1)
    expect(row?.properties.ownerName).toBe('Désirée Larkspur')
  })

  it('a five-digit lot is excepted, not truncated', () => {
    const [row] = rows(
      csv('7,14000,0,0,Quillfeather,,PO Box 1,,Alder Pond,NH,03999,12,Heron Cove Road'),
    )
    expect(row).toBeDefined()
    expect(row?.properties).not.toHaveProperty('id')
  })

  it('blank owner_2 joins to the single owner', () => {
    const [row] = rows(
      csv('7,14,0,0,Quillfeather Odessa,,PO Box 1,,Alder Pond,NH,03999,12,Heron Cove Road'),
    )
    expect(row?.properties.ownerName).toBe('Quillfeather Odessa')
  })

  it('joins two owners with the joiner and blank columns to null', () => {
    const [row] = rows(csv('7,14,0,0,Fenwick Rowan,Fenwick Ione,,,,,,,'))
    expect(row?.properties.ownerName).toBe('Fenwick Rowan & Fenwick Ione')
    expect(row?.properties.mailingAddress).toBeNull()
    expect(row?.properties.siteAddress).toBeNull()
  })

  it('reads a pipe delimited file and a utf-8 file with a byte order mark', () => {
    const mapping: CamaMapping = { ...DEFAULT_CAMA_MAPPING, delimiter: '|' }
    const body = `${HEADER.replaceAll(',', '|')}\n7|14|0|0|Fenwick Rowan||||||||`
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)])
    const [row] = rows(withBom, mapping)
    expect(row?.properties.id).toBe('007014000000000')
  })

  it('reports a missing mapped column as malformed with the column name', () => {
    const result = readCamaCsv(new TextEncoder().encode('map,lot\n7,14'), DEFAULT_CAMA_MAPPING)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.detail).toContain('sub')
  })
})
