import { randomBytes } from 'node:crypto'

const DOCUMENTATION_PREFIX = '2001:db8'

export function distinctClientHeaders(): Record<string, string> {
  const host = [randomBytes(2), randomBytes(2), randomBytes(2)].map((b) => b.toString('hex'))
  return { 'X-Forwarded-For': `${DOCUMENTATION_PREFIX}::${host.join(':')}` }
}
