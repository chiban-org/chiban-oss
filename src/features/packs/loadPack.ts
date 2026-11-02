import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import { type PackManifestData, PackManifestSchema, type PackRule } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'

export type Pack = PackManifestData

let cached: Pack | null = null

export function loadPack(): Pack {
  if (cached !== null) return cached
  const parsed = PackManifestSchema.safeParse(NH_PACK_MANIFEST)
  if (!parsed.success) {
    throw new AppError(ErrorIds.PACK_INVALID, 'The jurisdiction pack failed its schema', {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    })
  }
  cached = parsed.data
  return cached
}

export function ruleByKey(pack: Pack, key: string, version?: number): PackRule {
  const candidates = pack.rules.filter(
    (r) => r.key === key && (version === undefined || r.version === version),
  )
  const best = candidates.reduce<PackRule | null>(
    (acc, r) => (acc === null || r.version > acc.version ? r : acc),
    null,
  )
  if (best === null) {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'No such pack rule', { key, version })
  }
  return best
}
