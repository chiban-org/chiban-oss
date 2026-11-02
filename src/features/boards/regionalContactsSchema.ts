import { z } from 'zod'

const ContactSchema = z.object({ name: z.string().min(1), mailingAddress: z.string().min(1) })

export const RegionalContactsBodySchema = z.object({
  key: z.literal('default'),
  commission: ContactSchema.nullable(),
  municipalities: z.array(ContactSchema.extend({ key: z.string().min(1) })),
  nhDes: ContactSchema.nullable(),
})
export type RegionalContactsBody = z.infer<typeof RegionalContactsBodySchema>
export type Contact = z.infer<typeof ContactSchema>

export const EMPTY_REGIONAL_CONTACTS: RegionalContactsBody = {
  key: 'default',
  commission: null,
  municipalities: [],
  nhDes: null,
}
