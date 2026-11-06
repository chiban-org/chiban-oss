import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { TargetInput } from '@/features/export/targets/manageTargets'
import { trimmed } from '@/features/input/field'
import {
  inputField,
  optionalText,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import { err, ok } from '@/types/result'

const MAX_TEXT = 500

const KINDS = ['local_fs', 's3', 'onedrive'] as const

const absolutePath = inputField((raw) => {
  const value = trimmed(raw)
  if (value === '') return err('Enter the full path of the folder.')
  if (value.length > MAX_TEXT) return err(`Enter the folder of ${MAX_TEXT} characters or fewer.`)
  return isAbsolute(value) ? ok(value) : err('Enter the full path of the folder, starting with /.')
})

const webAddress = inputField((raw) => {
  const value = trimmed(raw)
  if (value === '') return err('Enter the storage address.')
  return URL.canParse(value) && value.length <= MAX_TEXT
    ? ok(value)
    : err('Enter the storage address as a web address starting with https://.')
})

const kindChoice = inputField((raw) => {
  const found = KINDS.find((k) => k === trimmed(raw))
  return found === undefined ? err('Choose where the copies go.') : ok(found)
})

const FIELDS = {
  root: absolutePath,
  endpoint: webAddress,
  bucket: requiredText('the bucket', { max: MAX_TEXT }),
  region: requiredText('the region', { max: MAX_TEXT }),
  tenantId: requiredText('the tenant ID', { max: MAX_TEXT }),
  clientId: requiredText('the client ID', { max: MAX_TEXT }),
  driveId: requiredText('the drive ID', { max: MAX_TEXT }),
  accessKeyId: requiredText('the access key ID', { max: MAX_TEXT }),
  secretAccessKey: requiredText('the secret access key', { max: MAX_TEXT }),
  clientSecret: requiredText('the client secret', { max: MAX_TEXT }),
} as const

type FieldName = keyof typeof FIELDS

const SETTINGS_FIELDS: Record<(typeof KINDS)[number], readonly FieldName[]> = {
  local_fs: ['root'],
  s3: ['endpoint', 'bucket', 'region'],
  onedrive: ['tenantId', 'clientId', 'driveId'],
}

const CREDENTIAL_FIELDS: Record<(typeof KINDS)[number], readonly FieldName[]> = {
  local_fs: [],
  s3: ['accessKeyId', 'secretAccessKey'],
  onedrive: ['clientSecret'],
}

const optionalFields = Object.fromEntries(
  [...Object.keys(FIELDS), 'prefix'].map((name) => [name, z.unknown().optional()]),
)

export const SAVE_TARGET_FORM = z
  .object({
    kind: kindChoice,
    id: z
      .unknown()
      .optional()
      .transform((raw) => (trimmed(raw) === '' ? null : trimmed(raw))),
    name: requiredText('a name', { max: 120 }),
    dayOfMonth: wholeNumber('the day of the month', { min: 1, max: 28 }),
    prefix: optionalText('the folder inside the bucket', { max: MAX_TEXT }),
    ...optionalFields,
  })
  .superRefine((value, ctx) => {
    const raw = value as unknown as Record<string, unknown>
    for (const field of SETTINGS_FIELDS[value.kind]) {
      report(ctx, field, raw[field])
    }
    const secrets = CREDENTIAL_FIELDS[value.kind]
    const given = secrets.filter((f) => trimmed(raw[f]) !== '')
    if (value.id === null || given.length > 0) {
      for (const field of secrets) report(ctx, field, raw[field])
    }
  })

function report(ctx: z.RefinementCtx, field: FieldName, value: unknown): void {
  const parsed = FIELDS[field].safeParse(value)
  if (parsed.success) return
  for (const issue of parsed.error.issues) {
    ctx.addIssue({ code: 'custom', path: [field], message: issue.message })
  }
}

type SaveTargetValues = z.output<typeof SAVE_TARGET_FORM>

function pick(raw: Record<string, unknown>, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, trimmed(raw[n])]))
}

export function targetInputOf(value: SaveTargetValues): TargetInput {
  const raw = value as unknown as Record<string, unknown>
  const common = {
    kind: value.kind,
    name: value.name,
    dayOfMonth: value.dayOfMonth,
    ...(value.id === null ? {} : { id: value.id }),
  }
  const secretNames = CREDENTIAL_FIELDS[value.kind]
  const secrets = pick(raw, secretNames)
  const credentials = Object.values(secrets).every((v) => v === '') ? null : secrets
  if (value.kind === 'local_fs')
    return { ...common, settings: pick(raw, ['root']), credentials: null }
  if (value.kind === 's3') {
    const prefix = value.prefix ?? ''
    return {
      ...common,
      settings: { ...pick(raw, ['endpoint', 'bucket', 'region']), prefix },
      credentials,
    }
  }
  return { ...common, settings: pick(raw, SETTINGS_FIELDS.onedrive), credentials }
}

export const TARGET_ID_FORM = z.object({ id: recordId('a target') })

export const TARGET_ACTIVE_FORM = z.object({
  id: recordId('a target'),
  active: z
    .unknown()
    .optional()
    .transform((raw) => trimmed(raw) === 'true'),
})
