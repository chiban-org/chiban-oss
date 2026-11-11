import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { err, ok, type Result } from '@/types/result'
import type { StorageTarget, TargetError } from './types'

export interface LocalFsSettings {
  root: string
}

function inside(root: string, path: string): Result<string, TargetError> {
  const base = resolve(root)
  const full = resolve(base, path)
  if (path === '' || !full.startsWith(`${base}${sep}`)) {
    return err({ kind: 'bad_shape', detail: 'path is outside the target folder' })
  }
  return ok(full)
}

function failure(e: unknown): TargetError {
  const code = (e as { code?: string }).code
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return { kind: 'denied', detail: 'the folder is not writable' }
  }
  return { kind: 'unreachable', detail: e instanceof Error ? e.message : 'write failed' }
}

export function createLocalFsTarget(settings: LocalFsSettings): StorageTarget {
  return {
    kind: 'local_fs',
    async put(path, body, size, signal) {
      const full = inside(settings.root, path)
      if (!full.ok) {
        body.destroy()
        return full
      }
      const temp = `${full.value}.${randomUUID()}.partial`
      try {
        await mkdir(dirname(full.value), { recursive: true })
        await pipeline(body, createWriteStream(temp), { signal })
        const written = await stat(temp)
        if (written.size !== size) {
          await unlink(temp)
          return err({ kind: 'bad_shape', detail: 'written size differs from the expected size' })
        }
        await rename(temp, full.value)
        return ok(undefined)
      } catch (e) {
        await unlink(temp).catch(() => undefined)
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err(failure(e))
      }
    },
    async exists(path, signal) {
      signal.throwIfAborted()
      const full = inside(settings.root, path)
      if (!full.ok) return full
      try {
        return ok((await stat(full.value)).isFile())
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return ok(false)
        return err(failure(e))
      }
    },
    async get(path, signal) {
      signal.throwIfAborted()
      const full = inside(settings.root, path)
      if (!full.ok) return full
      try {
        await stat(full.value)
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return err('not_found')
        return err(failure(e))
      }
      return ok(Readable.from(createReadStream(full.value)))
    },
    async list(folder, signal) {
      signal.throwIfAborted()
      const full = inside(settings.root, folder)
      if (!full.ok) return full
      try {
        const entries = await readdir(full.value, { withFileTypes: true })
        return ok(entries.filter((e) => e.isFile()).map((e) => e.name))
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return ok([])
        return err(failure(e))
      }
    },
    async delete(path, signal) {
      signal.throwIfAborted()
      const full = inside(settings.root, path)
      if (!full.ok) return full
      try {
        await unlink(full.value)
        return ok(undefined)
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return ok(undefined)
        return err(failure(e))
      }
    },
  }
}
