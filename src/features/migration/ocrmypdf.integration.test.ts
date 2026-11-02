import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, type TestContext } from 'vitest'
import { env } from '@/config/env'
import { createOcrmypdfConverter } from '@/features/migration/ocrmypdf'

const MISSING_MESSAGE =
  'ocrmypdf not found: brew install ocrmypdf or apt-get install ocrmypdf tesseract-ocr-eng'
const TIMEOUT_MS = 180_000

function binaryPresent(): boolean {
  try {
    execFileSync(env.OCRMYPDF_PATH, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const present = binaryPresent()

function requireBinary(ctx: TestContext): void {
  if (!present) ctx.skip(MISSING_MESSAGE)
}

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../test/fixtures/scanned/${name}`, import.meta.url))

const converter = createOcrmypdfConverter({
  path: env.OCRMYPDF_PATH,
  language: 'eng',
  timeoutMs: 120_000,
})
const signal = () => AbortSignal.timeout(TIMEOUT_MS)

describe('ocrmypdf converter', () => {
  it(
    'an image-only scanned pdf gets a pdfa rendition whose text contains ALDER POND',
    async (ctx) => {
      requireBinary(ctx)
      const out = await converter.ocrToPdfA(fixture('alder-pond-scan.pdf'), 'pdf', signal())
      if (!out.ok) throw new Error(`${out.error.reason}: ${out.error.detail}`)
      expect(out.value.text).toContain('ALDER POND')
      const latin1 = Buffer.from(out.value.pdf).toString('latin1')
      expect(latin1.startsWith('%PDF-')).toBe(true)
      expect(latin1).toMatch(/pdfaid:part(?:>|=["'])2/)
    },
    TIMEOUT_MS,
  )

  it(
    'a tiff scan converts',
    async (ctx) => {
      requireBinary(ctx)
      const out = await converter.ocrToPdfA(fixture('alder-pond-scan.tiff'), 'image', signal())
      if (!out.ok) throw new Error(`${out.error.reason}: ${out.error.detail}`)
      expect(out.value.text).toContain('ALDER POND')
      expect(Buffer.from(out.value.pdf).toString('latin1').startsWith('%PDF-')).toBe(true)
    },
    TIMEOUT_MS,
  )

  it(
    'an encrypted pdf maps to encrypted',
    async (ctx) => {
      requireBinary(ctx)
      const out = await converter.ocrToPdfA(fixture('alder-pond-encrypted.pdf'), 'pdf', signal())
      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.error.reason).toBe('encrypted')
        expect(out.error.exitCode).toBe(8)
      }
    },
    TIMEOUT_MS,
  )

  it(
    'a file that is not a pdf maps to bad_input',
    async (ctx) => {
      requireBinary(ctx)
      const out = await converter.ocrToPdfA(fixture('not-a-scan.txt'), 'pdf', signal())
      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.error.reason).toBe('bad_input')
        expect(out.error.exitCode).toBe(2)
      }
    },
    TIMEOUT_MS,
  )

  it('a missing executable maps to missing_dependency', async () => {
    const broken = createOcrmypdfConverter({
      path: '/nonexistent/ocrmypdf',
      language: 'eng',
      timeoutMs: 10_000,
    })
    const out = await broken.ocrToPdfA(fixture('alder-pond-scan.pdf'), 'pdf', signal())
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.reason).toBe('missing_dependency')
  })
})
