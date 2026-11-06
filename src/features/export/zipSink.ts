import type { Readable } from 'node:stream'
import { ZipFile } from 'yazl'
import type { ArchiveSink } from '@/features/export/archiveTypes'

const FILE_MODE = 0o644
const STORED_PREFIX = 'files/'

export function createZipSink(): { sink: ArchiveSink; stream: Readable; finish(): void } {
  const zip = new ZipFile()
  const stream = zip.outputStream as Readable
  return {
    stream,
    finish: () => zip.end(),
    sink: {
      write: (entry) =>
        new Promise<void>((resolve, reject) => {
          entry.body.once('error', (e) => {
            stream.destroy(e)
            reject(e)
          })
          entry.body.once('end', () => resolve())
          zip.addReadStream(entry.body, entry.path, {
            size: entry.size,
            mode: FILE_MODE,
            compress: !entry.path.startsWith(STORED_PREFIX),
          })
        }),
    },
  }
}
