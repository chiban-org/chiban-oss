import { Readable } from 'node:stream'
import { extract } from 'tar-stream'
import type { ArchiveEntry } from '@/features/export/archiveTypes'

export interface ArchiveSource {
  entries(): AsyncIterable<ArchiveEntry>
}

export function tarSource(input: Readable): ArchiveSource {
  return {
    async *entries() {
      const parser = extract()
      input.on('error', (e) => parser.destroy(e))
      input.pipe(parser)
      for await (const entry of parser) {
        yield {
          path: entry.header.name,
          size: entry.header.size,
          body: Readable.from(entry),
        }
      }
    },
  }
}

export async function readAll(body: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of body) {
    const buf = Buffer.from(chunk as Uint8Array)
    total += buf.length
    if (total > limit) throw new RangeError('entry larger than allowed')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}
