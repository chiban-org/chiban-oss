import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAll } from '@/features/export/readArchive'
import { zipSourceFromBuffer, zipSourceFromFile } from '@/features/export/readZip'
import { createZipSink } from '@/features/export/zipSink'

const run = promisify(execFile)

const written: [string, Buffer][] = [
  ['manifest.json', Buffer.from('{"format":"chiban-export"}\n', 'utf8')],
  ['FORMAT.md', Buffer.from('# Chiban export format\n', 'utf8')],
  ['data/parcels.ndjson', Buffer.from('{"id":1}\n{"id":2}\n'.repeat(500), 'utf8')],
  ['files/sha256/ab/cd/abcd', randomBytes(70_000)],
]

async function build(entries: [string, Buffer][]): Promise<Buffer> {
  const out = createZipSink()
  const chunks: Buffer[] = []
  out.stream.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => out.stream.on('end', () => resolve()))
  for (const [path, bytes] of entries) {
    await out.sink.write({ path, size: bytes.length, body: Readable.from([bytes]) })
  }
  out.finish()
  await finished
  return Buffer.concat(chunks)
}

async function collect(bytes: Buffer): Promise<{ order: string[]; entries: Map<string, Buffer> }> {
  const order: string[] = []
  const entries = new Map<string, Buffer>()
  for await (const entry of zipSourceFromBuffer(bytes).entries()) {
    order.push(entry.path)
    expect(entry.size).toBe(written.find(([p]) => p === entry.path)?.[1].length)
    entries.set(entry.path, await readAll(entry.body, 1_000_000))
  }
  return { order, entries }
}

let zip: Buffer
let dir: string

beforeAll(async () => {
  zip = await build(written)
  dir = await mkdtemp(join(tmpdir(), 'chiban-zip-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('zip archive', () => {
  it('reads back every entry in the order it was written, byte for byte', async () => {
    const { order, entries } = await collect(zip)
    expect(order).toEqual(written.map(([path]) => path))
    for (const [path, bytes] of written) expect(entries.get(path)?.equals(bytes), path).toBe(true)
  })

  it('reads the same entries from a file on disk', async () => {
    const file = join(dir, 'export.zip')
    await writeFile(file, zip)
    const paths: string[] = []
    for await (const entry of zipSourceFromFile(file).entries()) paths.push(entry.path)
    expect(paths).toEqual(written.map(([path]) => path))
  })

  it('is a standard zip that the system unzip tool accepts', async () => {
    const file = join(dir, 'check.zip')
    await writeFile(file, zip)
    const { stdout } = await run('unzip', ['-t', file])
    expect(stdout).toContain('No errors detected')
  })

  it('stores documents without compression and compresses data files', async () => {
    const file = join(dir, 'methods.zip')
    await writeFile(file, zip)
    const { stdout } = await run('unzip', ['-v', file])
    const line = (path: string) => stdout.split('\n').find((l) => l.endsWith(path)) ?? ''
    expect(line('files/sha256/ab/cd/abcd')).toContain('Stored')
    expect(line('data/parcels.ndjson')).toContain('Defl')
  })

  it('rejects a corrupt archive instead of yielding entries', async () => {
    const broken = Buffer.from('this is not a zip file at all')
    await expect(async () => {
      for await (const entry of zipSourceFromBuffer(broken).entries()) void entry
    }).rejects.toThrow()
  })
})
