import { AppError, ErrorIds } from '@/constants/errorIds'
import { loadPack } from '@/features/packs/loadPack'
import type { AbutterParams } from '@/features/packs/schema'

export function primaryAbutterParams(): AbutterParams {
  const [first] = loadPack().abutterParams
  if (first === undefined) {
    throw new AppError(ErrorIds.PACK_INVALID, 'The jurisdiction pack has no abutter parameters')
  }
  return first
}
