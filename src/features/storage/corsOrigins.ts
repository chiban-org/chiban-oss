export function corsOriginsFor(settings: {
  BASE_URL: string
  S3_CORS_ORIGINS: readonly string[]
}): string[] {
  const listed = settings.S3_CORS_ORIGINS.map((entry) => new URL(entry).origin)
  return listed.length > 0 ? [...new Set(listed)] : [new URL(settings.BASE_URL).origin]
}
