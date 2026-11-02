import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 2 ** 15
const R = 8
const P = 1
const KEY_BYTES = 64
const SALT_BYTES = 16
const MAXMEM = 128 * N * R * 2

interface ScryptParams {
  n: number
  r: number
  p: number
}

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_BYTES,
      { N: params.n, r: params.r, p: params.p, maxmem: MAXMEM },
      (error, key) => {
        if (error) reject(error)
        else resolve(key)
      },
    )
  })
}

export async function hashPassword(password: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, { n: N, r: R, p: P })
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(
  password: string,
  stored: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const parts = stored.split('$')
  const [scheme, nText, rText, pText, saltText, hashText] = parts
  if (parts.length !== 6 || scheme !== 'scrypt') return false
  if (saltText === undefined || hashText === undefined) return false
  const n = Number(nText)
  const r = Number(rText)
  const p = Number(pText)
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false
  const expected = Buffer.from(hashText, 'base64url')
  if (expected.length !== KEY_BYTES) return false
  try {
    const actual = await derive(password, Buffer.from(saltText, 'base64url'), { n, r, p })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
