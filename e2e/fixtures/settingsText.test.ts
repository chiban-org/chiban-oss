import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./settings.ts', import.meta.url), 'utf8')

describe('e2e settings', () => {
  it('defaults the port to 4730, outside the 3100 range other projects use', () => {
    expect(source).toContain("const DEFAULT_PORT = '4730'")
  })

  it('points bucket CORS at the e2e origin so no fixed port list is needed', () => {
    expect(source).toMatch(/S3_CORS_ORIGINS: E2E_BASE_URL/)
  })
})
