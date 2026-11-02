import type { NoticeChannel } from '@/features/notices/channels'

export const PROOF_METHODS = [
  'certified_mail',
  'certificate_of_mailing',
  'other_carrier_with_evidence',
  'first_class_mail',
  'newspaper_publication',
  'posting',
  'website_posting',
] as const
export type ProofMethod = (typeof PROOF_METHODS)[number]

export const ALLOWED_METHODS: Record<NoticeChannel, ProofMethod[]> = {
  verified_mail: ['certified_mail', 'certificate_of_mailing', 'other_carrier_with_evidence'],
  certified_mail: ['certified_mail'],
  first_class_mail: ['first_class_mail', 'certificate_of_mailing', 'certified_mail'],
  newspaper: ['newspaper_publication'],
  public_posting: ['posting'],
  bulletin_board: ['posting'],
  website: ['website_posting'],
}

export const PROOF_METHOD_LABELS: Record<ProofMethod, string> = {
  certified_mail: 'Certified mail receipt',
  certificate_of_mailing: 'Certificate of mailing',
  other_carrier_with_evidence: 'Other carrier with evidence of mailing',
  first_class_mail: 'First class mail',
  newspaper_publication: 'Newspaper publication',
  posting: 'Posting',
  website_posting: 'Website posting',
}

export function methodAllowed(channel: NoticeChannel, method: ProofMethod): boolean {
  return ALLOWED_METHODS[channel].includes(method)
}

export function referenceRequired(method: ProofMethod): boolean {
  return method === 'certified_mail' || method === 'other_carrier_with_evidence'
}
