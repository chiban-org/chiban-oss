import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAPLIBRE_WORKER_PUBLIC_PATH } from '@/components/map/workerUrl'
import { copyMaplibreWorker } from './copyMaplibreWorker'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('maplibre worker', () => {
  it('is copied to the path the map configures', () => {
    const publicDir = mkdtempSync(path.join(tmpdir(), 'maplibre-public-'))
    copyMaplibreWorker(publicDir)
    expect(existsSync(path.join(publicDir, MAPLIBRE_WORKER_PUBLIC_PATH))).toBe(true)
  })

  it('is registered by the map component before any map is created', () => {
    const source = readFileSync(path.join(ROOT, 'src/components/map/ParcelMap.tsx'), 'utf8')
    expect(source).toContain('setWorkerUrl(MAPLIBRE_WORKER_URL)')
  })

  it('is produced before dev and build start', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.predev).toContain('copyMaplibreWorker')
    expect(pkg.scripts.prebuild).toContain('copyMaplibreWorker')
  })
})
