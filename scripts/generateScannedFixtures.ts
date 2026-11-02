import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from '@/config/env'
import { renderPdf } from '@/features/pdf/renderPdf'
import { wrapImageAsPdf } from '@/features/preservation/wrapImage'

const OUT = path.resolve('src/test/fixtures/scanned')
const DPI = '150'
const PASSWORD = 'alder-pond-fixture'

function gs(args: string[]): void {
  execFileSync(env.GHOSTSCRIPT_PATH, ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', ...args])
}

async function sourcePdf(heading: string, body: string): Promise<Uint8Array> {
  return await renderPdf({
    title: heading,
    townName: 'Town of Alder Pond',
    scale: 'document',
    blocks: [
      { kind: 'heading', text: heading },
      { kind: 'paragraph', text: body },
    ],
  })
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const work = mkdtempSync(path.join(tmpdir(), 'scanned-fixtures-'))
  try {
    const source = path.join(work, 'source.pdf')
    writeFileSync(
      source,
      await sourcePdf(
        'ALDER POND PROPERTY RECORD',
        'ALDER POND septic system approval for the Heron Cove Road lot',
      ),
    )
    const png = path.join(work, 'page.png')
    gs(['-sDEVICE=png16m', `-r${DPI}`, `-sOutputFile=${png}`, source])
    writeFileSync(
      path.join(OUT, 'alder-pond-scan.pdf'),
      await wrapImageAsPdf(readFileSync(png), 'image/png'),
    )
    gs([
      '-sDEVICE=tiffg4',
      `-r${DPI}`,
      `-sOutputFile=${path.join(OUT, 'alder-pond-scan.tiff')}`,
      source,
    ])
    gs([
      '-sDEVICE=pdfwrite',
      `-sOwnerPassword=${PASSWORD}`,
      `-sUserPassword=${PASSWORD}`,
      `-sOutputFile=${path.join(OUT, 'alder-pond-encrypted.pdf')}`,
      source,
    ])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

await main()
