import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { plainFrame } from '@/features/pdf/frame'
import { renderPdf } from '@/features/pdf/renderPdf'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { pdfaDef } from '@/features/preservation/pdfaDef'
import { wrapImageAsPdf } from '@/features/preservation/wrapImage'

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../test/fixtures/documents/${name}`, import.meta.url))),
  )

const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})
const signal = () => AbortSignal.timeout(120_000)

describe('ghostscript', () => {
  it('ghostscript is installed', () => {
    let version = ''
    try {
      version = execFileSync(env.GHOSTSCRIPT_PATH, ['--version']).toString().trim()
    } catch {
      throw new Error(
        'Install Ghostscript: brew install ghostscript or apt-get install ghostscript',
      )
    }
    expect(Number.parseInt(version, 10)).toBeGreaterThanOrEqual(10)
  })

  it('a pdf from renderPdf converts to output whose XMP says pdfaid:part 2', async () => {
    const input = await renderPdf({
      title: 'Permit',
      frame: plainFrame('Town of Alder Pond'),
      scale: 'document',
      blocks: [{ kind: 'paragraph', text: 'Garage addition on Heron Cove Road' }],
    })
    const out = await converter.toPdfA(input, signal())
    if (!out.ok) throw new Error(out.error.detail)
    const text = Buffer.from(out.value).toString('latin1')
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toMatch(/pdfaid:part(?:>|=["'])2/)
  })

  it('a corrupt pdf is a conversion or validation failure with detail', async () => {
    const out = await converter.toPdfA(fixture('corrupt.pdf'), signal())
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(['conversion_failed', 'validation_failed']).toContain(out.error.reason)
      expect(out.error.detail.length).toBeGreaterThan(0)
    }
  })

  it('extracts the text layer and finds none in an image-only pdf', async () => {
    const withText = await converter.extractText(fixture('text-layer.pdf'), signal())
    expect(withText.ok && withText.value).toContain('Hello permit 603-555-0142')
    const wrapped = await wrapImageAsPdf(fixture('tiny.jpg'), 'image/jpeg')
    const imageOnly = await converter.extractText(wrapped, signal())
    expect(imageOnly.ok && imageOnly.value.trim()).toBe('')
  })

  it('a jpeg is wrapped into a one page pdf and converts', async () => {
    const wrapped = await wrapImageAsPdf(fixture('tiny.jpg'), 'image/jpeg')
    const out = await converter.toPdfA(wrapped, signal())
    expect(out.ok).toBe(true)
  })

  it('a conversion that exceeds the timeout fails with timeout', async () => {
    const slow = createGhostscriptConverter({
      gsPath: env.GHOSTSCRIPT_PATH,
      iccProfilePath: null,
      timeoutMs: 1,
    })
    const out = await slow.toPdfA(fixture('text-layer.pdf'), signal())
    expect(out).toMatchObject({ ok: false, error: { reason: 'timeout' } })
  })
})

describe('pdfaDef', () => {
  it('substitutes the profile path and drops comment lines', () => {
    const shipped = '%!PS\n% Customise\n/ICCProfile (srgb.icc) % Customise\ndef\n'
    const def = pdfaDef(shipped, '/opt/icc/srgb.icc')
    expect(def).toContain('(/opt/icc/srgb.icc)')
    expect(def).not.toContain('%')
  })
})
