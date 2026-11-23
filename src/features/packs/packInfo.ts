import { createHash } from 'node:crypto'
import { activePack } from '@/features/packs/registry'

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
  const manifest = activePack().manifest
  return {
    id: manifest.id,
    version: manifest.version,
    hash: createHash('sha256').update(canonicalJson(manifest)).digest('hex'),
  }
}
