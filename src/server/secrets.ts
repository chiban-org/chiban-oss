import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { err, ok, type Result } from '@/types/result'

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const ALGORITHM = 'aes-256-gcm'

type DecryptError = 'unknown_key' | 'malformed' | 'tampered'

interface ParsedBlob {
  keyId: string
  iv: Buffer
  tag: Buffer
  ciphertext: Buffer
}

function keyBytes(keyId: string): Buffer | null {
  const encoded = new Map(Object.entries(env.CHIBAN_SECRET_KEYS)).get(keyId)
  return encoded === undefined ? null : Buffer.from(encoded, 'base64')
}

function parseBlob(blob: string): ParsedBlob | null {
  const parts = blob.split(':')
  const [version, keyId, iv, tag, ciphertext] = parts
  if (parts.length !== 5 || version !== VERSION) return null
  if (
    keyId === undefined ||
    keyId === '' ||
    iv === undefined ||
    tag === undefined ||
    ciphertext === undefined
  )
    return null
  const parsed = {
    keyId,
    iv: Buffer.from(iv, 'base64url'),
    tag: Buffer.from(tag, 'base64url'),
    ciphertext: Buffer.from(ciphertext, 'base64url'),
  }
  if (parsed.iv.length !== IV_BYTES || parsed.tag.length !== TAG_BYTES) return null
  return parsed
}

export function encryptSecret(plaintext: string): string {
  const keyId = env.CHIBAN_ACTIVE_KEY_ID
  const key = keyBytes(keyId)
  if (key === null) {
    throw new AppError(ErrorIds.SEC_UNKNOWN_KEY, 'Active secret key is not configured', { keyId })
  }
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    VERSION,
    keyId,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptSecret(blob: string): Result<string, DecryptError> {
  const parsed = parseBlob(blob)
  if (parsed === null) return err('malformed')
  const key = keyBytes(parsed.keyId)
  if (key === null) return err('unknown_key')
  try {
    const decipher = createDecipheriv(ALGORITHM, key, parsed.iv)
    decipher.setAuthTag(parsed.tag)
    const plain = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()])
    return ok(plain.toString('utf8'))
  } catch {
    return err('tampered')
  }
}

export function needsReencrypt(blob: string): boolean {
  const parsed = parseBlob(blob)
  return parsed !== null && parsed.keyId !== env.CHIBAN_ACTIVE_KEY_ID
}
