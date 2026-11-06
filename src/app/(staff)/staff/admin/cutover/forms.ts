import { z } from 'zod'
import { inputField, recordId } from '@/features/input/schemas'
import { err, ok } from '@/types/result'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

function csvFile(missing: string) {
  return inputField((raw) => {
    if (!(raw instanceof File) || raw.size === 0) return err(missing)
    if (raw.size > MAX_FILE_BYTES) return err('Choose a file under 10 MB.')
    return ok(raw)
  })
}

export const IMPORT_FORM = z.object({
  file: csvFile('Choose a CSV file.'),
  mode: z
    .unknown()
    .optional()
    .transform((raw) => (raw === 'import' ? ('import' as const) : ('check' as const))),
})

export const RECONCILE_FORM = z.object({ file: csvFile("Choose the town's list as a CSV file.") })

export const SIGN_OFF_FORM = z.object({ reconciliationId: recordId('a comparison') })
