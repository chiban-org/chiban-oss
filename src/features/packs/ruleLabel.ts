import { loadPack } from '@/features/packs/loadPack'
import { words } from '@/lib/words'

export function ruleLabel(key: string): string {
  const latest = loadPack()
    .rules.filter((r) => r.key === key)
    .sort((a, b) => b.version - a.version)[0]
  return latest?.label ?? words(key.split('.').at(-1) ?? key)
}
