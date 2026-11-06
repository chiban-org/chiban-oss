import type { Readable } from 'node:stream'
import { type Entry, fromBuffer, open, type ZipFile } from 'yauzl'
import type { ArchiveEntry } from '@/features/export/archiveTypes'
import type { ArchiveSource } from '@/features/export/readArchive'

const OPEN_OPTIONS = { lazyEntries: true, autoClose: false }

function nextEntry(zip: ZipFile): Promise<Entry | null> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: Entry) => {
      cleanup()
      resolve(entry)
    }
    const onEnd = () => {
      cleanup()
      resolve(null)
    }
    const onError = (e: Error) => {
      cleanup()
      reject(e)
    }
    const cleanup = () => {
      zip.off('entry', onEntry)
      zip.off('end', onEnd)
      zip.off('error', onError)
    }
    zip.on('entry', onEntry)
    zip.on('end', onEnd)
    zip.on('error', onError)
    zip.readEntry()
  })
}

function sourceOf(openZip: () => Promise<ZipFile>): ArchiveSource {
  return {
    async *entries(): AsyncIterable<ArchiveEntry> {
      const zip = await openZip()
      try {
        for (;;) {
          const entry = await nextEntry(zip)
          if (entry === null) return
          if (entry.fileName.endsWith('/')) continue
          const body: Readable = await zip.openReadStreamPromise(entry)
          yield { path: entry.fileName, size: entry.uncompressedSize, body }
        }
      } finally {
        zip.close()
      }
    },
  }
}

export function zipSourceFromFile(path: string): ArchiveSource {
  return sourceOf(
    () =>
      new Promise((resolve, reject) => {
        open(path, OPEN_OPTIONS, (e, zip) => (e ? reject(e) : resolve(zip)))
      }),
  )
}

export function zipSourceFromBuffer(bytes: Buffer): ArchiveSource {
  return sourceOf(
    () =>
      new Promise((resolve, reject) => {
        fromBuffer(bytes, OPEN_OPTIONS, (e, zip) => (e ? reject(e) : resolve(zip)))
      }),
  )
}
