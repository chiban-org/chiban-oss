import { z } from 'zod'

const ContactSchema = z.object({ name: z.string().min(1), mailingAddress: z.string().min(1) })

export const RegionalContactsBodySchema = z.object({
  key: z.literal('default'),
  commission: ContactSchema.nullable(),
  municipalities: z.array(
    ContactSchema.extend({
      key: z.string().min(1),
      clerk: ContactSchema.optional(),
      reviewingAuthority: ContactSchema.optional(),
    }),
  ),
  nhDes: ContactSchema.nullable(),
  waterSuppliers: z
    .array(ContactSchema.extend({ key: z.string().min(1) }))
    .default([])
    .refine((list) => new Set(list.map((w) => w.key)).size === list.length, {
      message: 'water supplier keys must be unique',
    }),
})
export type RegionalContactsBody = z.infer<typeof RegionalContactsBodySchema>
export type StoredRegionalContacts = Partial<RegionalContactsBody>
export type Contact = z.infer<typeof ContactSchema>

export const EMPTY_REGIONAL_CONTACTS: RegionalContactsBody = {
  key: 'default',
  commission: null,
  municipalities: [],
  nhDes: null,
  waterSuppliers: [],
}

export function withContactDefaults(stored: StoredRegionalContacts): RegionalContactsBody {
  return { ...EMPTY_REGIONAL_CONTACTS, ...stored }
}
