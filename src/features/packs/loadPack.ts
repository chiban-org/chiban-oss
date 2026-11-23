import { AppError, ErrorIds } from '@/constants/errorIds'
import { activePack } from '@/features/packs/registry'
import {
  type PackManifest,
  type PackManifestData,
  PackManifestSchema,
  type PackRule,
} from '@/features/packs/schema'

export type Pack = PackManifestData

const parsedByManifest = new WeakMap<PackManifest, Pack>()

export function loadPack(): Pack {
  const manifest = activePack().manifest
  const cached = parsedByManifest.get(manifest)
  if (cached !== undefined) return cached
  const parsed = PackManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    throw new AppError(ErrorIds.PACK_INVALID, 'The jurisdiction pack failed its schema', {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    })
  }
  parsedByManifest.set(manifest, parsed.data)
  return parsed.data
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
