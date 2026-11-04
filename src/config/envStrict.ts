export const ENV_PREFIXES_STRICT = [
  'CHIBAN_',
  'S3_',
  'SMTP_',
  'HEALTH_',
  'ALERT_',
  'PAGER_',
  'EXPORT_',
  'GHOSTSCRIPT_',
  'BACKUP_',
  'USPS_',
] as const

export function findUndeclaredKeys(
  present: readonly string[],
  declared: readonly string[],
): string[] {
  const known = new Set(declared)
  return present.filter(
    (key) => ENV_PREFIXES_STRICT.some((prefix) => key.startsWith(prefix)) && !known.has(key),
  )
}
