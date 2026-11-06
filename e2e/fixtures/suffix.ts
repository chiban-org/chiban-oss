import { randomBytes } from 'node:crypto'
import { DEMO_DOMAIN } from '@/features/demo/domain'

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
}

export function uniqueEmail(label: string, suffix: string = uniqueSuffix()): string {
  return `e2e-${label}-${suffix}@${DEMO_DOMAIN}`
}
