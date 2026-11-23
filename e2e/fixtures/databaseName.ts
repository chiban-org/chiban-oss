const DEFAULT_PACK = 'nh'
const PACK_ID = /^[a-z]{2}$/

export function e2eDatabaseName(port: number, pack: string | undefined): string {
  const id = pack?.trim() ?? ''
  if (id === '' || id === DEFAULT_PACK) return `chiban_e2e_${port}`
  if (!PACK_ID.test(id)) throw new Error(`CHIBAN_PACK must be a two-letter pack id, got "${id}"`)
  return `chiban_e2e_${id}_${port}`
}
