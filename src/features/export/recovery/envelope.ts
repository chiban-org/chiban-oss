import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { Readable } from 'node:stream'
import { AppError, ErrorIds } from '@/constants/errorIds'

const MAGIC = 'CHIBANREC1\n'
const KDF = { N: 32768, r: 8, p: 1 } as const
const SALT_BYTES = 16
const KEY_BYTES = 32
const TAG_BYTES = 16
const LENGTH_BYTES = 4
const CHUNK_BYTES = 65536
const MAX_CHUNK_BYTES = 1024 * 1024
const KDF_MAXMEM = 128 * 1024 * 1024

interface Header {
  kdf: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
  chunk: number
}

function invalid(detail: string): AppError {
  return new AppError(ErrorIds.EXPORT_ENVELOPE_INVALID, 'recovery envelope is not valid', {
    detail,
  })
}

async function deriveKey(passphrase: string, salt: Buffer, header: Header): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    scrypt(
      Buffer.from(passphrase, 'utf8'),
      salt,
      KEY_BYTES,
      { N: header.N, r: header.r, p: header.p, maxmem: KDF_MAXMEM },
      (e, key) => (e === null ? resolve(key) : reject(e)),
    )
  })
}

function nonceFor(index: number): Buffer {
  const nonce = Buffer.alloc(12)
  nonce.writeBigUInt64BE(BigInt(index), 4)
  return nonce
}

function aadFor(index: number, last: boolean): Buffer {
  const aad = Buffer.alloc(9)
  aad.writeBigUInt64BE(BigInt(index), 0)
  aad.writeUInt8(last ? 1 : 0, 8)
  return aad
}

function sealChunk(key: Buffer, index: number, last: boolean, plain: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, nonceFor(index), { authTagLength: TAG_BYTES })
  cipher.setAAD(aadFor(index, last))
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const length = Buffer.alloc(LENGTH_BYTES)
  length.writeUInt32BE(body.length)
  return Buffer.concat([length, body, cipher.getAuthTag()])
}

async function* encrypt(input: Readable, passphrase: string): AsyncGenerator<Buffer> {
  const salt = randomBytes(SALT_BYTES)
  const header: Header = {
    kdf: 'scrypt',
    ...KDF,
    salt: salt.toString('base64'),
    chunk: CHUNK_BYTES,
  }
  const key = await deriveKey(passphrase, salt, header)
  yield Buffer.from(`${MAGIC}${JSON.stringify(header)}\n`, 'utf8')
  let pending = Buffer.alloc(0)
  let held: Buffer | null = null
  let index = 0
  for await (const piece of input) {
    pending = Buffer.concat([pending, Buffer.from(piece as Uint8Array)])
    while (pending.length >= CHUNK_BYTES) {
      if (held !== null) {
        yield sealChunk(key, index, false, held)
        index += 1
      }
      held = pending.subarray(0, CHUNK_BYTES)
      pending = pending.subarray(CHUNK_BYTES)
    }
  }
  if (held !== null && pending.length === 0) {
    yield sealChunk(key, index, true, held)
    return
  }
  if (held !== null) {
    yield sealChunk(key, index, false, held)
    index += 1
  }
  yield sealChunk(key, index, true, pending)
}

export function encryptStream(input: Readable, passphrase: string): Readable {
  return Readable.from(encrypt(input, passphrase))
}

class Reader {
  private buffer = Buffer.alloc(0)
  private ended = false
  private readonly iterator: AsyncIterator<unknown>

  constructor(input: Readable) {
    this.iterator = input[Symbol.asyncIterator]()
  }

  async take(count: number): Promise<Buffer | null> {
    while (this.buffer.length < count && !this.ended) {
      const next = await this.iterator.next()
      if (next.done === true) this.ended = true
      else this.buffer = Buffer.concat([this.buffer, Buffer.from(next.value as Uint8Array)])
    }
    if (this.buffer.length < count) return null
    const out = this.buffer.subarray(0, count)
    this.buffer = this.buffer.subarray(count)
    return out
  }

  hasLeftover(): boolean {
    return this.buffer.length > 0
  }

  async line(): Promise<string | null> {
    for (;;) {
      const at = this.buffer.indexOf(10)
      if (at >= 0) {
        const out = this.buffer.subarray(0, at + 1).toString('utf8')
        this.buffer = this.buffer.subarray(at + 1)
        return out
      }
      if (this.ended) return null
      const next = await this.iterator.next()
      if (next.done === true) this.ended = true
      else this.buffer = Buffer.concat([this.buffer, Buffer.from(next.value as Uint8Array)])
    }
  }
}

async function readHeader(reader: Reader): Promise<Header> {
  if ((await reader.line()) !== MAGIC) throw invalid('not a recovery envelope')
  const raw = await reader.line()
  if (raw === null) throw invalid('missing header')
  const parsed = JSON.parse(raw) as Partial<Header>
  const header = parsed as Header
  const sane =
    header.kdf === 'scrypt' &&
    Number.isInteger(header.N) &&
    header.N >= 1024 &&
    header.N <= 1 << 20 &&
    header.r === KDF.r &&
    header.p === KDF.p &&
    typeof header.salt === 'string' &&
    Number.isInteger(header.chunk) &&
    header.chunk > 0 &&
    header.chunk <= MAX_CHUNK_BYTES
  if (!sane) throw invalid('unsupported header')
  return header
}

function openChunk(key: Buffer, index: number, last: boolean, frame: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, nonceFor(index), {
    authTagLength: TAG_BYTES,
  })
  decipher.setAAD(aadFor(index, last))
  decipher.setAuthTag(frame.subarray(frame.length - TAG_BYTES))
  try {
    return Buffer.concat([
      decipher.update(frame.subarray(0, frame.length - TAG_BYTES)),
      decipher.final(),
    ])
  } catch {
    throw invalid('authentication failed')
  }
}

async function nextFrame(reader: Reader, chunk: number): Promise<Buffer | null> {
  const lengthBytes = await reader.take(LENGTH_BYTES)
  if (lengthBytes === null) {
    if (reader.hasLeftover()) throw invalid('trailing bytes')
    return null
  }
  const length = lengthBytes.readUInt32BE()
  if (length > chunk) throw invalid('chunk too large')
  const body = await reader.take(length + TAG_BYTES)
  if (body === null) throw invalid('truncated chunk')
  return body
}

async function* decrypt(input: Readable, passphrase: string): AsyncGenerator<Buffer> {
  const reader = new Reader(input)
  const header = await readHeader(reader)
  const key = await deriveKey(passphrase, Buffer.from(header.salt, 'base64'), header)
  let held = await nextFrame(reader, header.chunk)
  if (held === null) throw invalid('missing final chunk')
  let index = 0
  for (;;) {
    const following = await nextFrame(reader, header.chunk)
    if (following === null) {
      yield openChunk(key, index, true, held)
      return
    }
    yield openChunk(key, index, false, held)
    held = following
    index += 1
  }
}

export function decryptStream(input: Readable, passphrase: string): Readable {
  return Readable.from(decrypt(input, passphrase))
}
