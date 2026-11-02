import type { ArchiveSink } from '@/features/export/archiveTypes'

export function memoryArchive(): {
  sink: ArchiveSink
  entries: Map<string, Buffer>
  order: string[]
} {
  const entries = new Map<string, Buffer>()
  const order: string[] = []
  return {
    entries,
    order,
    sink: {
      async write(entry) {
        const chunks: Buffer[] = []
        for await (const chunk of entry.body) chunks.push(Buffer.from(chunk as Uint8Array))
        entries.set(entry.path, Buffer.concat(chunks))
        order.push(entry.path)
      },
    },
  }
}
