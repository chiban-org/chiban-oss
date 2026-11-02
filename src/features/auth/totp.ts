import { Secret, TOTP } from 'otpauth'

const ISSUER = 'Chiban'
const PERIOD_SECONDS = 30
const DIGITS = 6
const WINDOW_STEPS = 1

function build(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  })
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

export function totpUri(secretBase32: string, accountEmail: string): string {
  return build(secretBase32, accountEmail).toString()
}

export function currentTotpCode(secretBase32: string, nowMs: number): string {
  return build(secretBase32, 'code').generate({ timestamp: nowMs })
}

export function verifyTotpCounter(
  secretBase32: string,
  code: string,
  nowMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const delta = build(secretBase32, 'code').validate({
    token: code,
    timestamp: nowMs,
    window: WINDOW_STEPS,
  })
  if (delta === null) return null
  return Math.floor(nowMs / 1000 / PERIOD_SECONDS) + delta
}

export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number = Date.now(),
): boolean {
  return verifyTotpCounter(secretBase32, code, nowMs) !== null
}
