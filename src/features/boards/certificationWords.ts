import { governingBody } from '@/features/packs/vocabulary'

export type CertificationOutcome = 'pending' | 'certified' | 'refused'

export function requestToGoverningBody(): string {
  return `Record a request to the ${governingBody()}`
}

export function certificationPhrase(outcome: CertificationOutcome): string {
  switch (outcome) {
    case 'pending':
      return `requested, waiting on the ${governingBody()}`
    case 'certified':
      return `certified by the ${governingBody()}`
    case 'refused':
      return `the ${governingBody()} refused`
  }
}

export function certificationOptions(): [CertificationOutcome, string][] {
  return [
    ['pending', 'Requested, waiting'],
    ['certified', `Certified by the ${governingBody()}`],
    ['refused', `The ${governingBody()} refused`],
  ]
}

export function certificationActivity(outcome: CertificationOutcome): string {
  switch (outcome) {
    case 'pending':
      return `Recorded a request to the ${governingBody()}`
    case 'certified':
      return `Recorded the ${governingBody()} certifying the request`
    case 'refused':
      return `Recorded the ${governingBody()} refusing the request`
  }
}
