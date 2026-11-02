import type { TargetInput } from '@/features/export/targets/manageTargets'
import { targetKindSchema } from '@/features/export/targets/settings'
import { text } from '@/server/actionRunner'

function pick(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, text(formData, k)]))
}

function credentialsOf(formData: FormData, keys: string[]): Record<string, string> | null {
  const values = pick(formData, keys)
  return Object.values(values).every((v) => v === '') ? null : values
}

export function parseTargetForm(formData: FormData): TargetInput | null {
  const kind = targetKindSchema.safeParse(text(formData, 'kind'))
  if (!kind.success) return null
  const common = {
    kind: kind.data,
    name: text(formData, 'name'),
    dayOfMonth: Number(text(formData, 'dayOfMonth')),
    ...(text(formData, 'id') === '' ? {} : { id: text(formData, 'id') }),
  }
  if (kind.data === 'local_fs') {
    return { ...common, settings: pick(formData, ['root']), credentials: null }
  }
  if (kind.data === 's3') {
    return {
      ...common,
      settings: pick(formData, ['endpoint', 'bucket', 'prefix', 'region']),
      credentials: credentialsOf(formData, ['accessKeyId', 'secretAccessKey']),
    }
  }
  return {
    ...common,
    settings: pick(formData, ['tenantId', 'clientId', 'driveId']),
    credentials: credentialsOf(formData, ['clientSecret']),
  }
}
