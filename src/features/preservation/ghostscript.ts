import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pdfaDef } from '@/features/preservation/pdfaDef'
import {
  createVeraPdfValidator,
  type PdfaValidation,
  type PdfaValidator,
} from '@/features/preservation/verapdf'
import { err, ok, type Result } from '@/types/result'

export type ConvertFailure = {
  reason: 'conversion_failed' | 'validation_failed' | 'timeout'
  detail: string
}
export type TextFailure = { reason: 'conversion_failed' | 'timeout'; detail: string }

export interface PdfaConverter {
  toPdfA(input: Uint8Array, signal: AbortSignal): Promise<Result<Uint8Array, ConvertFailure>>
  extractText(input: Uint8Array, signal: AbortSignal): Promise<Result<string, TextFailure>>
  validatePdfA?(input: Uint8Array, signal: AbortSignal): Promise<PdfaValidation>
}

export interface GhostscriptConfig {
  gsPath: string
  iccProfilePath: string | null
  timeoutMs: number
  veraPdfPath?: string
}

interface Run {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
}

const MAX_BUFFER = 64 * 1024 * 1024
const XMP_PART_TWO = /pdfaid:part(?:>|=["'])2/
const GS_REPORTED_ERROR = /\*{4} Error|No pages will be processed/
const LOCATE_TIMEOUT_MS = 30_000
const DEFAULT_VERAPDF_PATH = 'verapdf'
const SEARCH_PATH_LINE = /^\s+(\/\S.*?)\s*:?\s*$/

function run(
  file: string,
  args: string[],
  config: GhostscriptConfig,
  signal: AbortSignal,
): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: config.timeoutMs, maxBuffer: MAX_BUFFER, signal, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => {
        const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null
        resolve({
          code: failure === null ? 0 : typeof failure.code === 'number' ? failure.code : 1,
          stdout: String(stdout),
          stderr: failure === null ? String(stderr) : `${String(stderr)}${failure.message}`,
          timedOut: failure?.killed === true,
        })
      },
    )
  })
}

interface Resources {
  pdfaDefSource: string
  iccPath: string
}

async function locateResources(
  config: GhostscriptConfig,
  signal: AbortSignal,
): Promise<Resources | null> {
  const help = await run(config.gsPath, ['-h'], { ...config, timeoutMs: LOCATE_TIMEOUT_MS }, signal)
  const dirs = help.stdout
    .split('\n')
    .map((line) => SEARCH_PATH_LINE.exec(line)?.[1])
    .filter((d): d is string => d !== undefined)
  for (const dir of dirs) {
    try {
      const source = await readFile(path.join(dir, 'PDFA_def.ps'), 'utf8')
      const icc = config.iccProfilePath ?? path.join(dir, '..', 'iccprofiles', 'srgb.icc')
      await readFile(icc)
      return { pdfaDefSource: source, iccPath: path.resolve(icc) }
    } catch {
      continue
    }
  }
  return null
}

function failureOf(result: Run, fallback: 'conversion_failed'): ConvertFailure {
  if (result.timedOut) return { reason: 'timeout', detail: 'Ghostscript exceeded its time limit' }
  return {
    reason: fallback,
    detail: `${result.stdout}${result.stderr}`.trim().slice(0, 2000) || 'Ghostscript failed',
  }
}

export function createGhostscriptConverter(config: GhostscriptConfig): PdfaConverter {
  let resources: Promise<Resources | null> | null = null
  const validator: PdfaValidator = createVeraPdfValidator({
    path: config.veraPdfPath ?? DEFAULT_VERAPDF_PATH,
    timeoutMs: config.timeoutMs,
  })
  return {
    validatePdfA: (input, signal) => validator.validate(input, signal),
    async toPdfA(input, signal) {
      signal.throwIfAborted()
      resources ??= locateResources(config, signal)
      const found = await resources
      if (found === null) {
        resources = null
        return err({ reason: 'conversion_failed', detail: 'Ghostscript resources not found' })
      }
      const dir = await mkdtemp(path.join(tmpdir(), 'chiban-gs-'))
      try {
        const inPath = path.join(dir, 'in.pdf')
        const outPath = path.join(dir, 'out.pdf')
        const defPath = path.join(dir, 'pdfa_def.ps')
        await writeFile(inPath, input)
        await writeFile(defPath, pdfaDef(found.pdfaDefSource, found.iccPath))
        const result = await run(
          config.gsPath,
          [
            '-q',
            '-dSAFER',
            '-dBATCH',
            '-dNOPAUSE',
            '-sDEVICE=pdfwrite',
            '-dPDFA=2',
            '-dPDFACompatibilityPolicy=1',
            '-sColorConversionStrategy=RGB',
            `--permit-file-read=${found.iccPath}`,
            `-sOutputFile=${outPath}`,
            defPath,
            inPath,
          ],
          config,
          signal,
        )
        if (
          result.timedOut ||
          result.code !== 0 ||
          GS_REPORTED_ERROR.test(result.stdout + result.stderr)
        ) {
          return err(failureOf(result, 'conversion_failed'))
        }
        const output = new Uint8Array(await readFile(outPath))
        const head = Buffer.from(output.subarray(0, 5)).toString('latin1')
        if (head !== '%PDF-' || !XMP_PART_TWO.test(Buffer.from(output).toString('latin1'))) {
          return err({
            reason: 'validation_failed',
            detail: result.stderr.trim().slice(0, 2000) || 'Output is not PDF/A-2',
          })
        }
        return ok(output)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err({
          reason: 'conversion_failed',
          detail: e instanceof Error ? e.message : 'failed',
        })
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
    async extractText(input, signal) {
      signal.throwIfAborted()
      const dir = await mkdtemp(path.join(tmpdir(), 'chiban-gs-'))
      try {
        const inPath = path.join(dir, 'in.pdf')
        await writeFile(inPath, input)
        const result = await run(
          config.gsPath,
          ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=txtwrite', '-sOutputFile=-', inPath],
          config,
          signal,
        )
        if (result.timedOut)
          return err({ reason: 'timeout', detail: 'Ghostscript exceeded its time limit' })
        if (result.code !== 0 || GS_REPORTED_ERROR.test(result.stderr)) {
          return err({ reason: 'conversion_failed', detail: result.stderr.trim().slice(0, 2000) })
        }
        return ok(result.stdout)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  }
}
