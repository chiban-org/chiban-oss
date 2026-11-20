import type { AbutterParams } from '@/features/packs/schema'

export function effectiveBufferFt(
  configuredFt: number | null | undefined,
  params: AbutterParams,
): number | null {
  if (params.townBuffer === undefined) return null
  return configuredFt ?? params.townBuffer.defaultFt
}

export function bufferWithinMax(ft: number, params: AbutterParams): boolean {
  return params.townBuffer !== undefined && ft <= params.townBuffer.maxFt
}
