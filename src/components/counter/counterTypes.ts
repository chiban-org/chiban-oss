export interface CounterLinks {
  permit: string
  placard: string
  receipt: string | null
}

export type FieldErrors = Readonly<Record<string, string>>

export type CounterOutcome =
  | { ok: false; error: string; fieldErrors?: FieldErrors; reviewHref?: string }
  | {
      ok: true
      state: 'issued' | 'submitted'
      number: string
      applicationId: string
      attemptId: string | null
      links: CounterLinks | null
    }

export type ReaderStatus =
  | { ok: false; error: string }
  | { ok: true; state: string; outcomeUnknown: boolean }

export type CounterClaimResult = { ok: true; message: string } | { ok: false; error: string }

export interface ContractorAccountMatch {
  companyName: string
  contactName: string
  licenses: { trade: string; label: string; number: string }[]
  prefillLicenseNumber: string | null
}

export type ContractorLookupResult =
  | { ok: true; account: ContractorAccountMatch | null }
  | { ok: false; error: string }

export interface CounterActions {
  issue(formData: FormData): Promise<CounterOutcome>
  reader(formData: FormData): Promise<ReaderStatus>
  check(formData: FormData): Promise<ReaderStatus>
  reconnect(formData: FormData): Promise<ReaderStatus>
  complete(formData: FormData): Promise<CounterOutcome>
  claim?: (formData: FormData) => Promise<CounterClaimResult>
  lookupContractor?: (formData: FormData) => Promise<ContractorLookupResult>
}

export interface LicenseGroup {
  label: string
  licenses: readonly string[]
}
