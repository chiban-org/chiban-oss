import { createHmac, randomBytes } from 'node:crypto'

const SALT = randomBytes(32)
const UNKNOWN = 'unknown'

export function clientKey(xForwardedFor: string | null): string {
  const entries = (xForwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const address = entries.at(-1)
  if (address === undefined) return UNKNOWN
  return createHmac('sha256', SALT).update(address).digest('hex')
}
