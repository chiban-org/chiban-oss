import { createHash } from 'node:crypto'
import { NH_PACK_MANIFEST } from '@packs/nh/manifest'

export interface PackInfo {
  id: string
  version: string
  hash: string
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function packInfo(): PackInfo {
  return {
    id: NH_PACK_MANIFEST.id,
    version: NH_PACK_MANIFEST.version,
    hash: createHash('sha256').update(canonicalJson(NH_PACK_MANIFEST)).digest('hex'),
  }
}
