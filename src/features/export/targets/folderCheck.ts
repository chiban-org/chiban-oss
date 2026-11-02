import { access, constants, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

async function nearestExisting(path: string): Promise<string | null> {
  let current = resolve(path)
  for (;;) {
    const found = await stat(current).catch(() => null)
    if (found !== null) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function folderIsWritable(root: string): Promise<boolean> {
  const existing = await nearestExisting(root)
  if (existing === null) return false
  const info = await stat(existing)
  if (!info.isDirectory()) return false
  return await access(existing, constants.W_OK | constants.X_OK).then(
    () => true,
    () => false,
  )
}
