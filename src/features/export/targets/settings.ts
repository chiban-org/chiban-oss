import { isAbsolute } from 'node:path'
import { z } from 'zod'

const GRAPH_AUTHORITY = 'https://login.microsoftonline.com'
const GRAPH_BASE = 'https://graph.microsoft.com'

const text = z.string().trim().min(1).max(500)

export const localFsSettingsSchema = z.object({
  root: text.refine((value) => isAbsolute(value)),
})

export const s3SettingsSchema = z.object({
  endpoint: z.url(),
  bucket: text,
  prefix: z
    .string()
    .trim()
    .transform((value) => {
      const stripped = value.replace(/^\/+/, '').replace(/\/+$/, '')
      return stripped === '' ? '' : `${stripped}/`
    }),
  region: text,
})

export const s3CredentialsSchema = z.object({ accessKeyId: text, secretAccessKey: text })

export const oneDriveSettingsSchema = z.object({
  tenantId: text,
  clientId: text,
  driveId: text,
  authorityBase: z.url().default(GRAPH_AUTHORITY),
  graphBase: z.url().default(GRAPH_BASE),
})

export const oneDriveCredentialsSchema = z.object({ clientSecret: text })

export const targetKindSchema = z.enum(['local_fs', 's3', 'onedrive'])

export const SETTINGS_SCHEMAS = {
  local_fs: { settings: localFsSettingsSchema, credentials: null },
  s3: { settings: s3SettingsSchema, credentials: s3CredentialsSchema },
  onedrive: { settings: oneDriveSettingsSchema, credentials: oneDriveCredentialsSchema },
} as const

export const targetNameSchema = text.max(120)
export const dayOfMonthSchema = z.number().int().min(1).max(28)
