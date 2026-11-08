import { Readable } from 'node:stream'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { zipSourceFromBuffer } from '@/features/export/readZip'
import { writeArchive } from '@/features/export/writeArchive'
import { createZipSink } from '@/features/export/zipSink'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'

const testConverter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})

export async function buildZip(db: Db, store: ObjectStore, signal: AbortSignal): Promise<Buffer> {
  const out = createZipSink()
  const chunks: Buffer[] = []
  out.stream.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => out.stream.on('end', () => resolve()))
  await writeArchive(
    db,
    store,
    {
      exportId: crypto.randomUUID(),
      kind: 'business',
      base: null,
      bundle: { converter: testConverter },
    },
    out.sink,
    signal,
  )
  out.finish()
  await finished
  return Buffer.concat(chunks)
}

export const sourceOf = (bytes: Buffer) => zipSourceFromBuffer(bytes)

export async function freshTarget() {
  const target = await makeTestDb()
  const { store } = await makeTestStore()
  return { target, store }
}

export async function collectEntries(bytes: Buffer): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  for await (const entry of sourceOf(bytes).entries()) {
    const chunks: Buffer[] = []
    for await (const c of entry.body) chunks.push(Buffer.from(c as Uint8Array))
    out.set(entry.path, Buffer.concat(chunks))
  }
  return out
}

export async function rebuildZip(entries: Map<string, Buffer>): Promise<Buffer> {
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
