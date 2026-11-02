import type { Readable } from 'node:stream'

export interface ArchiveEntry {
  path: string
  size: number
  body: Readable
}

export interface ArchiveSink {
  write(entry: ArchiveEntry): Promise<void>
}
