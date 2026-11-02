import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAILPIT_IMAGE, MINIO_IMAGE, POSTGIS_IMAGE } from '@/constants/infra'

const compose = readFileSync(new URL('./docker-compose.dev.yml', import.meta.url), 'utf8')
const images = [...compose.matchAll(/^\s+image:\s*(\S+)$/gm)].map((m) => m[1] ?? '')

describe('docker-compose.dev.yml', () => {
  it('uses no latest tag and no untagged image', () => {
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(image, image).not.toMatch(/:latest(@|$)/)
      expect(image, image).toMatch(/[:@]/)
    }
  })

  it('pins mailpit and minio by digest', () => {
    expect(MAILPIT_IMAGE).toMatch(/^axllent\/mailpit@sha256:[0-9a-f]{64}$/)
    expect(MINIO_IMAGE).toMatch(/@sha256:[0-9a-f]{64}$/)
  })

  it('compose images match the shared infra constants', () => {
    expect(images).toEqual(expect.arrayContaining([POSTGIS_IMAGE, MINIO_IMAGE, MAILPIT_IMAGE]))
  })
})
