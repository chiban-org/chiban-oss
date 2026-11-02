import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { MAPLIBRE_WORKER_PUBLIC_PATH } from '../src/components/map/workerUrl'

const WORKER_FILE = 'maplibre-gl-worker.mjs'

export function copyMaplibreWorker(publicDir: string): string {
  const require = createRequire(import.meta.url)
  const distDir = path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'))
  const target = path.join(publicDir, MAPLIBRE_WORKER_PUBLIC_PATH)
  mkdirSync(path.dirname(target), { recursive: true })
  copyFileSync(path.join(distDir, WORKER_FILE), target)
  return target
}
