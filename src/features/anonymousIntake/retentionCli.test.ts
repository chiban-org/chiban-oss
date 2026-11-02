import { describe, expect, it } from 'vitest'
import { parseVerifyCliArgs } from '@/features/anonymousIntake/retentionCli'

const SHA = 'a'.repeat(64)
const CHECK = [
  'check',
  '--markers',
  '/m.json',
  '--client-ip',
  '203.0.113.7',
  '--logs',
  '/l.txt',
  '--backup-dir',
  '/b',
  '--caddyfile-sha256',
  SHA,
]

describe('parseVerifyCliArgs', () => {
  it('parses the submit phase', () => {
    expect(parseVerifyCliArgs(['submit'])).toEqual({ ok: true, value: { phase: 'submit' } })
  })

  it('parses the check phase', () => {
    expect(parseVerifyCliArgs(CHECK)).toEqual({
      ok: true,
      value: {
        phase: 'check',
        markers: '/m.json',
        clientIp: '203.0.113.7',
        logs: '/l.txt',
        backupDir: '/b',
        caddyfileSha256: SHA,
      },
    })
  })

  it('refuses a check without a backup dir', () => {
    const without = CHECK.filter((_, i) => i !== 7 && i !== 8)
    expect(parseVerifyCliArgs(without).ok).toBe(false)
  })

  it('refuses a malformed digest, an unknown phase, and stray options', () => {
    expect(parseVerifyCliArgs([...CHECK.slice(0, -1), 'xyz']).ok).toBe(false)
    expect(parseVerifyCliArgs(['nope']).ok).toBe(false)
    expect(parseVerifyCliArgs(['submit', '--x']).ok).toBe(false)
    expect(parseVerifyCliArgs([]).ok).toBe(false)
  })
})
