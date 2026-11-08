'use server'

import { z } from 'zod'
import type { ContractorLookupResult } from '@/components/counter/counterTypes'
import { db } from '@/db/client'
import { findContractorAccount } from '@/features/contractors/accountLookup'
import { mayUseCounter } from '@/features/counter/counterAccess'
import { emailAddress, requiredText } from '@/features/input/schemas'
import { errorCopy } from '@/server/actionRunner'
import { guardedForm } from './counterGuard'

const LOOKUP_FORM = z.object({
  contractorEmail: emailAddress('the contractor email'),
  typeKey: requiredText('a permit type', { max: 100 }),
})

const fail = (error: string): ContractorLookupResult => ({ ok: false, error })

export async function lookupContractorAction(formData: FormData): Promise<ContractorLookupResult> {
  return await guardedForm(formData, LOOKUP_FORM, fail, async ({ actor, signal }, input) => {
    if (!(await mayUseCounter(db, actor, signal))) return fail(errorCopy('forbidden'))
    const account = await findContractorAccount(
      db,
      { email: input.contractorEmail, applicationTypeKey: input.typeKey },
      signal,
    )
    return { ok: true, account }
  })
}
