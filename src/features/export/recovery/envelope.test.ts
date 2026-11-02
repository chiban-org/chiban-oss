import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { decryptStream, encryptStream } from '@/features/export/recovery/envelope'

const PASSPHRASE = 'correct horse battery staple'

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}

const seal = async (bytes: Buffer, passphrase = PASSPHRASE) =>
  await collect(encryptStream(Readable.from([bytes]), passphrase))

const open = async (bytes: Buffer, passphrase = PASSPHRASE) =>
  await collect(decryptStream(Readable.from([bytes]), passphrase))

describe('recovery envelope', () => {
  it('round trip of 200 KB through encrypt and decrypt is byte-identical', async () => {
    const plain = randomBytes(200 * 1024)
    const sealed = await seal(plain)
    expect(sealed.subarray(0, 11).toString('utf8')).toBe('CHIBANREC1\n')
    expect(sealed.includes(plain.subarray(0, 64))).toBe(false)
    expect(await open(sealed)).toEqual(plain)
  })

  it('round trips empty input and an exact multiple of the chunk size', async () => {
    expect(await open(await seal(Buffer.alloc(0)))).toEqual(Buffer.alloc(0))
    const exact = randomBytes(65536 * 2)
    expect(await open(await seal(exact))).toEqual(exact)
  })

  it('a truncated envelope fails', async () => {
    const sealed = await seal(randomBytes(200 * 1024))
    await expect(open(sealed.subarray(0, sealed.length - 40))).rejects.toThrow()
    const header = sealed.indexOf('\n', sealed.indexOf('\n') + 1) + 1
    await expect(open(sealed.subarray(0, header))).rejects.toThrow()
  })

  it('bytes after the final chunk fail', async () => {
    const sealed = await seal(randomBytes(1000))
    await expect(open(Buffer.concat([sealed, Buffer.from([1, 2, 3])]))).rejects.toThrow()
  })

  it('a reordered chunk fails', async () => {
    const sealed = await seal(randomBytes(65536 * 3))
    const header = sealed.indexOf('\n', sealed.indexOf('\n') + 1) + 1
    const frame = 4 + 65536 + 16
    const body = sealed.subarray(header)
    const swapped = Buffer.concat([
      sealed.subarray(0, header),
      body.subarray(frame, frame * 2),
      body.subarray(0, frame),
      body.subarray(frame * 2),
    ])
    await expect(open(swapped)).rejects.toThrow()
  })

  it('a flipped ciphertext byte fails', async () => {
    const sealed = await seal(randomBytes(5000))
    sealed[sealed.length - 30] = (sealed[sealed.length - 30] ?? 0) ^ 1
    await expect(open(sealed)).rejects.toThrow()
  })

  it('a wrong passphrase fails', async () => {
    const sealed = await seal(randomBytes(5000))
    await expect(open(sealed, 'another passphrase entirely')).rejects.toThrow()
  })

  it('two seals of the same bytes differ', async () => {
    const plain = randomBytes(100)
    expect(await seal(plain)).not.toEqual(await seal(plain))
  })
})
