import type { ExportTargetRow } from '@/db/schema'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { createOneDriveTarget } from '@/features/export/targets/oneDrive'
import { createS3Target } from '@/features/export/targets/s3Target'
import {
  localFsSettingsSchema,
  oneDriveCredentialsSchema,
  oneDriveSettingsSchema,
  s3CredentialsSchema,
  s3SettingsSchema,
} from '@/features/export/targets/settings'
import type { StorageTarget } from '@/features/export/targets/types'
import type { TokenDeps } from '@/features/microsoft/graphToken'
import { decryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

function credentialsOf(row: ExportTargetRow): unknown {
  if (row.credentialsEnc === null) return null
  const plain = decryptSecret(row.credentialsEnc)
  if (!plain.ok) return null
  try {
    return JSON.parse(plain.value)
  } catch {
    return null
  }
}

export function buildTarget(
  row: ExportTargetRow,
  deps: TokenDeps,
): Result<StorageTarget, 'bad_settings' | 'bad_credentials'> {
  if (row.kind === 'local_fs') {
    const settings = localFsSettingsSchema.safeParse(row.settings)
    return settings.success ? ok(createLocalFsTarget(settings.data)) : err('bad_settings')
  }
  if (row.kind === 's3') {
    const settings = s3SettingsSchema.safeParse(row.settings)
    if (!settings.success) return err('bad_settings')
    const credentials = s3CredentialsSchema.safeParse(credentialsOf(row))
    return credentials.success
      ? ok(createS3Target(settings.data, credentials.data))
      : err('bad_credentials')
  }
  const settings = oneDriveSettingsSchema.safeParse(row.settings)
  if (!settings.success) return err('bad_settings')
  const credentials = oneDriveCredentialsSchema.safeParse(credentialsOf(row))
  if (!credentials.success) return err('bad_credentials')
  return ok(createOneDriveTarget(settings.data, credentials.data.clientSecret, deps))
}
