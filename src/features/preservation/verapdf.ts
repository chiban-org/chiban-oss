import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'

export const PDFA_PROFILE = 'PDF/A-2b'
const VALIDATOR_NAME = 'veraPDF'
const MAX_BUFFER = 64 * 1024 * 1024
const DETAIL_LIMIT = 500
const RULES_SHOWN = 3
export const VERAPDF_BATCH_SIZE = 100
const MAX_RUN_MS = 30 * 60 * 1000

export const pdfaValidationSchema = z.object({
  status: z.enum(['passed', 'failed', 'not_validated']),
  profile: z.string(),
  validator: z.string().nullable(),
  version: z.string().nullable(),
  detail: z.string().nullable(),
})

export type PdfaValidation = z.infer<typeof pdfaValidationSchema>

export interface PdfaValidator {
  validate(input: Uint8Array, signal: AbortSignal): Promise<PdfaValidation>
  validateMany(inputs: readonly Uint8Array[], signal: AbortSignal): Promise<PdfaValidation[]>
}

export interface VeraPdfConfig {
  path: string
  timeoutMs: number
}

const reportSchema = z.object({
  report: z.object({
    buildInformation: z
      .object({ releaseDetails: z.array(z.object({ id: z.string(), version: z.string() })) })
      .optional(),
    jobs: z
      .array(
        z.object({
          itemDetails: z.object({ name: z.string() }).optional(),
          taskException: z.unknown().optional(),
          validationResult: z
            .array(
              z.object({
                compliant: z.boolean(),
                details: z
                  .object({
                    ruleSummaries: z
                      .array(
                        z.object({
                          clause: z.string().optional(),
                          description: z.string().optional(),
                          failedChecks: z.number().optional(),
                        }),
                      )
                      .optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
        }),
      )
      .min(1),
  }),
})

type Report = z.infer<typeof reportSchema>
type Job = Report['report']['jobs'][number]

interface Run {
  stdout: string
  stderr: string
  missing: boolean
  timedOut: boolean
}

const NOT_INSTALLED = 'veraPDF is not installed or not configured'

export function notValidated(detail: string): PdfaValidation {
  return { status: 'not_validated', profile: PDFA_PROFILE, validator: null, version: null, detail }
}

function run(config: VeraPdfConfig, files: readonly string[], signal: AbortSignal): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      config.path,
      ['--flavour', '2b', '--format', 'json', ...files],
      {
        timeout: Math.min(config.timeoutMs * files.length, MAX_RUN_MS),
        maxBuffer: MAX_BUFFER,
        signal,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          missing: failure?.code === 'ENOENT',
          timedOut: failure?.killed === true,
        })
      },
    )
  })
}

function versionOf(report: Report): string | null {
  const apps = report.report.buildInformation?.releaseDetails.find((d) => d.id === 'apps')
  return apps?.version ?? null
}

function failedRules(result: NonNullable<Job['validationResult']>) {
  const rules = result[0]?.details?.ruleSummaries ?? []
  return rules
    .slice(0, RULES_SHOWN)
    .map((r) => `${r.clause ?? 'rule'}: ${r.description ?? 'failed'}`)
    .join('; ')
}

function judged(report: Report, job: Job | undefined): PdfaValidation {
  const validation = job?.validationResult
  const common = { profile: PDFA_PROFILE, validator: VALIDATOR_NAME, version: versionOf(report) }
  if (validation === undefined || validation.length === 0) {
    return { ...common, status: 'failed', detail: 'veraPDF could not read the file as a PDF' }
  }
  if (validation[0]?.compliant === true) return { ...common, status: 'passed', detail: null }
  return {
    ...common,
    status: 'failed',
    detail: failedRules(validation).slice(0, DETAIL_LIMIT) || 'The file does not meet PDF/A-2b',
  }
}

function parsed(stdout: string): Report | null {
  try {
    const result = reportSchema.safeParse(JSON.parse(stdout))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function jobFor(report: Report, file: string, index: number, count: number): Job | undefined {
  const named = report.report.jobs.find((j) => j.itemDetails?.name === file)
  if (named !== undefined) return named
  return count === 1 ? report.report.jobs[0] : report.report.jobs[index]
}

async function validateChunk(
  config: VeraPdfConfig,
  inputs: readonly Uint8Array[],
  signal: AbortSignal,
): Promise<PdfaValidation[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'chiban-verapdf-'))
  try {
    const files = inputs.map((_, i) => path.join(dir, `${String(i)}.pdf`))
    await Promise.all(files.map((file, i) => writeFile(file, inputs[i] ?? new Uint8Array())))
    const result = await run(config, files, signal)
    if (result.missing) return files.map(() => notValidated(NOT_INSTALLED))
    if (result.timedOut) return files.map(() => notValidated('veraPDF exceeded its time limit'))
    const report = parsed(result.stdout)
    if (report === null) {
      const said = result.stderr.trim().slice(0, DETAIL_LIMIT)
      const detail = `veraPDF gave no report${said === '' ? '' : `: ${said}`}`
      return files.map(() => notValidated(detail))
    }
    return files.map((file, i) => judged(report, jobFor(report, file, i, files.length)))
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    const detail = e instanceof Error ? e.message : 'veraPDF failed'
    return inputs.map(() => notValidated(detail))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export function createVeraPdfValidator(config: VeraPdfConfig): PdfaValidator {
  const validateMany = async (inputs: readonly Uint8Array[], signal: AbortSignal) => {
    signal.throwIfAborted()
    const results: PdfaValidation[] = []
    for (let i = 0; i < inputs.length; i += VERAPDF_BATCH_SIZE) {
      results.push(
        ...(await validateChunk(config, inputs.slice(i, i + VERAPDF_BATCH_SIZE), signal)),
      )
    }
    return results
  }
  return {
    validateMany,
    validate: async (input, signal) =>
      (await validateMany([input], signal))[0] ?? notValidated('veraPDF gave no result'),
  }
}
