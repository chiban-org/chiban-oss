import { Readable } from 'node:stream'
import { pack as createPack } from 'tar-stream'
import type { ArchiveSink } from '@/features/export/archiveTypes'

const FILE_MODE = 0o644

export function createTarSink(): { sink: ArchiveSink; stream: Readable; finish(): void } {
  const pack = createPack()
  return {
    stream: Readable.from(pack),
    finish: () => pack.finalize(),
    sink: {
      write: (entry) =>
        new Promise<void>((resolve, reject) => {
          const target = pack.entry({ name: entry.path, size: entry.size, mode: FILE_MODE }, (e) =>
            e ? reject(e) : resolve(),
          )
          entry.body.on('error', reject)
          entry.body.pipe(target)
        }),
    },
  }
}
