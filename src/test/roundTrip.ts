import { Readable } from 'node:stream'
import type { Db } from '@/db/client'
import { tarSource } from '@/features/export/readArchive'
import { createTarSink } from '@/features/export/tarSink'
import { writeArchive } from '@/features/export/writeArchive'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'

export async function buildTar(db: Db, store: ObjectStore, signal: AbortSignal): Promise<Buffer> {
  const out = createTarSink()
  const chunks: Buffer[] = []
  out.stream.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => out.stream.on('end', () => resolve()))
  await writeArchive(
    db,
    store,
    { exportId: crypto.randomUUID(), kind: 'business', base: null },
    out.sink,
    signal,
  )
  out.finish()
  await finished
  return Buffer.concat(chunks)
}

export const sourceOf = (bytes: Buffer) => tarSource(Readable.from([bytes]))

export async function freshTarget() {
  const target = await makeTestDb()
  const { store } = await makeTestStore()
  return { target, store }
}
