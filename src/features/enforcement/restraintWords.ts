import { boardAbbrev } from '@/features/packs/vocabulary'

export type RestraintIssuer = 'zba' | 'superior_court'

export function restraintIssuer(issuedBy: RestraintIssuer): string {
  return issuedBy === 'zba' ? `the ${boardAbbrev('zba')}` : 'the superior court'
}

export function restraintIssuerOptions(): [RestraintIssuer, string][] {
  return [
    ['zba', `The ${boardAbbrev('zba')}`],
    ['superior_court', 'The superior court'],
  ]
}
