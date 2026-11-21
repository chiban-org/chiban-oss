import type { AbutterParams } from '@/features/packs/schema'

export function effectiveBufferFt(
  configuredFt: number | null | undefined,
  params: AbutterParams,
): number | null {
  if (params.townBuffer === undefined) return null
  return configuredFt ?? params.townBuffer.defaultFt
}

export function bufferAboveMaxMessage(
  townBuffer: NonNullable<AbutterParams['townBuffer']>,
): string {
  const feet = String(townBuffer.maxFt)
  return townBuffer.maxSetBy === 'chiban'
    ? `Chiban limits this distance to at most ${feet} feet.`
    : `State law lets a town set this distance to at most ${feet} feet.`
}

export function bufferWithinMax(ft: number, params: AbutterParams): boolean {
  return params.townBuffer !== undefined && ft <= params.townBuffer.maxFt
}
