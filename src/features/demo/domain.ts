import { boardAbbrev } from '@/features/packs/vocabulary'

export const DEMO_DOMAIN = 'alderpond.example'

export function appealsMemberLocal(): string {
  return `${boardAbbrev('zba')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')}.member`
}
