import { env } from '@/config/env'
import { JOB_NAMES } from '@/constants/jobNames'
import { createOcrmypdfConverter, type OcrConverter } from '@/features/migration/ocrmypdf'
import { createGhostscriptConverter, type PdfaConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { validatePendingPreservation } from '@/features/preservation/validatePending'
import { createVeraPdfValidator, type PdfaValidator } from '@/features/preservation/verapdf'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const MINUTE_CHARS = 16
const MINUTE_SECONDS = 60
const CONVERSION_TIMEOUT_MS = 120_000
const OCR_TIMEOUT_MS = 600_000
const VALIDATION_ROUNDS = 10
const VALIDATION_TIMEOUT_MS = 120_000

interface PreservePayload {
  at?: string
}

interface PreserveDeps {
  store: ObjectStore
  converter: PdfaConverter
  ocr?: OcrConverter
  validator?: PdfaValidator
}

export function makeRecordsPreserveJob(deps: PreserveDeps) {
  return defineJob<PreservePayload>({
    name: JOB_NAMES.RECORDS_PRESERVE,
    intervalSeconds: MINUTE_SECONDS,
    dedupKey: (p) =>
      `${JOB_NAMES.RECORDS_PRESERVE}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
    handler: async (_payload, ctx) => {
      await processPreservation(ctx.db, deps.store, deps.converter, ctx.signal, undefined, deps.ocr)
      if (deps.validator !== undefined) {
        for (let round = 0; round < VALIDATION_ROUNDS; round += 1) {
          const recorded = await validatePendingPreservation(
            ctx.db,
            deps.store,
            deps.validator,
            ctx.signal,
          )
          if (recorded === 0) break
        }
      }
      return ok(undefined)
    },
  })
}

export const recordsPreserveJob = makeRecordsPreserveJob({
  get store() {
    return getObjectStore()
  },
  converter: createGhostscriptConverter({
    gsPath: env.GHOSTSCRIPT_PATH,
    iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
    timeoutMs: CONVERSION_TIMEOUT_MS,
  }),
  validator: createVeraPdfValidator({
    path: env.VERAPDF_PATH,
    timeoutMs: VALIDATION_TIMEOUT_MS,
  }),
  ocr: createOcrmypdfConverter({
    path: env.OCRMYPDF_PATH,
    language: 'eng',
    timeoutMs: OCR_TIMEOUT_MS,
  }),
})
