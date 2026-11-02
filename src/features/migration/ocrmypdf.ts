import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { err, ok, type Result } from '@/types/result'

export type OcrFailureReason =
  | 'bad_input'
  | 'missing_dependency'
  | 'invalid_output'
  | 'encrypted'
  | 'pdfa_failed'
  | 'timeout'
  | 'other'

export interface OcrFailure {
  reason: OcrFailureReason
  exitCode: number | null
  detail: string
}

export interface OcrConverter {
  ocrToPdfA(
    inputPath: string,
    kind: 'pdf' | 'image',
    signal: AbortSignal,
  ): Promise<Result<{ pdf: Uint8Array; text: string }, OcrFailure>>
}

export interface OcrmypdfConfig {
  path: string
  language: 'eng'
  timeoutMs: number
}

const MAX_BUFFER = 16 * 1024 * 1024
const IMAGE_DPI = '300'
const DETAIL_LIMIT = 2000

const EXIT_REASONS = new Map<number, OcrFailureReason>([
  [2, 'bad_input'],
  [3, 'missing_dependency'],
  [4, 'invalid_output'],
  [8, 'encrypted'],
  [10, 'pdfa_failed'],
])

interface Run {
  code: number | null
  detail: string
  timedOut: boolean
  missing: boolean
}

function run(file: string, args: string[], timeoutMs: number, signal: AbortSignal): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_BUFFER, signal, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => {
        const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null
        const detail = `${String(stdout)}${String(stderr)}`.trim().slice(-DETAIL_LIMIT)
        if (failure === null) return resolve({ code: 0, detail, timedOut: false, missing: false })
        resolve({
          code: typeof failure.code === 'number' ? failure.code : null,
          detail: detail === '' ? failure.message : detail,
          timedOut: failure.killed === true,
          missing: failure.code === 'ENOENT',
        })
      },
    )
  })
}

function failureOf(result: Run): OcrFailure {
  if (result.missing) {
    return { reason: 'missing_dependency', exitCode: null, detail: result.detail }
  }
  if (result.timedOut) return { reason: 'timeout', exitCode: result.code, detail: result.detail }
  const reason = (result.code === null ? undefined : EXIT_REASONS.get(result.code)) ?? 'other'
  return { reason, exitCode: result.code, detail: result.detail }
}

export function createOcrmypdfConverter(config: OcrmypdfConfig): OcrConverter {
  return {
    async ocrToPdfA(inputPath, kind, signal) {
      signal.throwIfAborted()
      const dir = await mkdtemp(path.join(tmpdir(), 'chiban-ocr-'))
      try {
        const outPath = path.join(dir, 'out.pdf')
        const sidecar = path.join(dir, 'out.txt')
        const args = [
          '--output-type',
          'pdfa-2',
          '--skip-text',
          '--rotate-pages',
          '--language',
          config.language,
          '--jobs',
          '1',
          '--sidecar',
          sidecar,
          ...(kind === 'image' ? ['--image-dpi', IMAGE_DPI] : []),
          inputPath,
          outPath,
        ]
        const result = await run(config.path, args, config.timeoutMs, signal)
        if (result.code !== 0 || result.missing || result.timedOut) return err(failureOf(result))
        const pdf = new Uint8Array(await readFile(outPath))
        if (Buffer.from(pdf.subarray(0, 5)).toString('latin1') !== '%PDF-') {
          return err({ reason: 'invalid_output', exitCode: 0, detail: 'Output is not a PDF' })
        }
        return ok({ pdf, text: await readFile(sidecar, 'utf8') })
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err({
          reason: 'other',
          exitCode: null,
          detail: e instanceof Error ? e.message : 'failed',
        })
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  }
}
