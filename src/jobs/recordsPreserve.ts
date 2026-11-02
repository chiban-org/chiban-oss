import { env } from '@/config/env'
import { JOB_NAMES } from '@/constants/jobNames'
import { createOcrmypdfConverter, type OcrConverter } from '@/features/migration/ocrmypdf'
import { createGhostscriptConverter, type PdfaConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const MINUTE_CHARS = 16
const MINUTE_SECONDS = 60
const CONVERSION_TIMEOUT_MS = 120_000
const OCR_TIMEOUT_MS = 600_000

interface PreservePayload {
  at?: string
}

interface PreserveDeps {
  store: ObjectStore
  converter: PdfaConverter
  ocr?: OcrConverter
}

export function makeRecordsPreserveJob(deps: PreserveDeps) {
  return defineJob<PreservePayload>({
    name: JOB_NAMES.RECORDS_PRESERVE,
    intervalSeconds: MINUTE_SECONDS,
    dedupKey: (p) =>
      `${JOB_NAMES.RECORDS_PRESERVE}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
    handler: async (_payload, ctx) => {
      await processPreservation(ctx.db, deps.store, deps.converter, ctx.signal, undefined, deps.ocr)
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
  ocr: createOcrmypdfConverter({
    path: env.OCRMYPDF_PATH,
    language: 'eng',
    timeoutMs: OCR_TIMEOUT_MS,
  }),
})
