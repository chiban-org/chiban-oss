import type { CamaMapping } from '@/features/cama/mapping'

const MAX_PATTERN_LENGTH = 300
const NAMED_GROUP = /\(\?<[A-Za-z_]\w*>/

export function compileFolderPattern(source: string): RegExp | null {
  if (source.length === 0 || source.length > MAX_PATTERN_LENGTH) return null
  if (!NAMED_GROUP.test(source)) return null
  try {
    return new RegExp(source)
  } catch {
    return null
  }
}

function partText(
  part: CamaMapping['id']['parts'][number],
  groups: Readonly<Record<string, string | undefined>>,
): string | null {
  if ('literal' in part) return part.literal
  const raw = groups[part.column]
  if (raw === undefined) return '0'.repeat(part.width)
  if (!/^\d+$/.test(raw) || raw.length > part.width) return null
  return raw.padStart(part.width, '0')
}

export function parseFolder(
  relativeDir: string,
  pattern: RegExp,
  parts: CamaMapping['id']['parts'],
): string | null {
  const matched = pattern.exec(relativeDir)
  const groups: Readonly<Record<string, string | undefined>> | undefined = matched?.groups
  if (groups === undefined || !Object.values(groups).some((v) => v !== undefined)) return null
  const texts = parts.map((part) => partText(part, groups))
  return texts.every((t): t is string => t !== null) ? texts.join('') : null
}
