import { statfs } from 'node:fs/promises'

export interface DiskReading {
  path: string
  usedRatio: number
}

export async function diskUsage(paths: string[], signal: AbortSignal): Promise<DiskReading[]> {
  const readings: DiskReading[] = []
  for (const path of paths) {
    signal.throwIfAborted()
    try {
      const stats = await statfs(path)
      if (stats.blocks > 0) readings.push({ path, usedRatio: 1 - stats.bavail / stats.blocks })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
    }
  }
  return readings
}
