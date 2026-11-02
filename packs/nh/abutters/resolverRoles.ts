import { eq } from 'drizzle-orm'
import {
  desProximityDeterminations,
  regionalImpactDeterminations,
  regionalImpactParties,
} from '@/db/schema'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import { professionalsFor } from '@/features/rosters/professionals'
import { activeRestrictions } from '@/features/rosters/restrictions'
import { rosterStatus } from '@/features/rosters/reviews'
import { type Context, makeRecipient, rosterProvenance } from './resolverContext'
import { applicantParty, applicationValues } from './resolverSources'

const FORM_ADDRESS_FIELD = 'applicant_mailing_address'

function wants(ctx: Context, role: Parameters<Context['input']['roles']['includes']>[0]): boolean {
  return ctx.input.roles.includes(role)
}

export async function resolveApplicant(ctx: Context, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (!wants(ctx, 'applicant')) return
  const party = await applicantParty(ctx.tx, ctx.input.applicationId)
  const values = await applicationValues(ctx.tx, ctx.input.applicationId)
  const address = typeof values[FORM_ADDRESS_FIELD] === 'string' ? values[FORM_ADDRESS_FIELD] : null
  const entry = makeRecipient(party.name, address, {
    roles: ['applicant'],
    parcelIds: [],
    provenance: [
      {
        source: 'application_form',
        ref: ctx.input.applicationId,
        asOf: null,
        ageDays: null,
        state: 'entered',
      },
    ],
  })
  ctx.recipients.unshift(entry)
  if (entry.status === 'incomplete_data') {
    ctx.incomplete.push({
      code: entry.name === '' ? 'owner_missing' : 'address_missing',
      detail:
        entry.name === ''
          ? 'The application has no applicant name on record.'
          : 'The application has no applicant mailing address.',
    })
  }
}

export async function resolveRestrictions(ctx: Context, signal: AbortSignal): Promise<void> {
  if (!wants(ctx, 'restriction_holder')) return
  const parcelIds = await applicantParcelIds(ctx.tx, ctx.input.applicationId, signal)
  const holdings = await activeRestrictions(ctx.tx, parcelIds, ctx.today, signal)
  const review = await rosterStatus(ctx.tx, 'restrictions', ctx.today, signal)
  if (review.state === 'never_reviewed') {
    ctx.incomplete.push({
      code: 'roster_never_reviewed',
      detail: 'The easement and restriction holders have never been reviewed for this town.',
    })
  }
  for (const holding of holdings) {
    ctx.recipients.push(
      makeRecipient(holding.holderName, holding.holderMailingAddress, {
        roles: ['restriction_holder'],
        parcelIds: [holding.parcelId],
        provenance: [
          rosterProvenance(
            'restriction_roster',
            holding.id,
            review.reviewedOn,
            ctx.today,
            review.state === 'reviewed' ? 'reviewed' : 'entered',
          ),
        ],
      }),
    )
  }
}

export async function resolveProfessionals(ctx: Context, signal: AbortSignal): Promise<void> {
  if (!wants(ctx, 'sealed_professional')) return
  for (const pro of await professionalsFor(ctx.tx, ctx.input.applicationId, signal)) {
    if (!pro.sealOnPlat) continue
    ctx.recipients.push(
      makeRecipient(pro.name, pro.businessAddress, {
        roles: ['sealed_professional'],
        parcelIds: [],
        provenance: [
          rosterProvenance('application_professionals', pro.id, null, ctx.today, 'entered'),
        ],
      }),
    )
  }
}

type Contacts = Awaited<ReturnType<typeof getRegionalContacts>>

function contactProvenance(ctx: Context, ref: string) {
  return rosterProvenance('regional_contacts', ref, null, ctx.today, 'entered')
}

function asks(ctx: Context, when: 'regional_impact_yes' | 'des_within_500ft'): boolean {
  return ctx.input.conditionalRoles.some((c) => c.when === when)
}

async function resolveRegional(ctx: Context, contacts: Contacts): Promise<void> {
  const [determination] = await ctx.tx
    .select()
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, ctx.input.applicationId))
  if (determination === undefined) {
    ctx.incomplete.push({
      code: 'determination_missing',
      detail: 'The regional impact determination has not been recorded.',
    })
    return
  }
  if (determination.determination !== 'yes') return
  if (contacts.commission === null) {
    ctx.incomplete.push({
      code: 'regional_contacts_missing',
      detail: 'The regional planning commission has no mailing address on file.',
    })
  } else {
    ctx.recipients.push(
      makeRecipient(contacts.commission.name, contacts.commission.mailingAddress, {
        roles: ['regional_planning_commission'],
        parcelIds: [],
        provenance: [contactProvenance(ctx, 'commission')],
        channelHint: 'certified_mail',
      }),
    )
  }
  const parties = await ctx.tx
    .select()
    .from(regionalImpactParties)
    .where(eq(regionalImpactParties.applicationId, ctx.input.applicationId))
  for (const party of parties) {
    const contact = contacts.municipalities.find((m) => m.key === party.municipalityKey)
    if (contact === undefined) {
      ctx.incomplete.push({
        code: 'regional_contacts_missing',
        detail: `The affected municipality ${party.municipalityKey} has no mailing address on file.`,
      })
      continue
    }
    ctx.recipients.push(
      makeRecipient(contact.name, contact.mailingAddress, {
        roles: ['affected_municipality'],
        parcelIds: [],
        provenance: [contactProvenance(ctx, contact.key)],
        channelHint: 'certified_mail',
      }),
    )
  }
}

async function resolveDes(ctx: Context, contacts: Contacts): Promise<void> {
  const [des] = await ctx.tx
    .select()
    .from(desProximityDeterminations)
    .where(eq(desProximityDeterminations.applicationId, ctx.input.applicationId))
  if (des === undefined) {
    ctx.incomplete.push({
      code: 'determination_missing',
      detail: 'The NH DES 500-foot determination has not been recorded.',
    })
    return
  }
  if (des.determination !== 'within_500ft') return
  if (contacts.nhDes === null) {
    ctx.incomplete.push({
      code: 'des_contact_missing',
      detail: 'The NH Department of Environmental Services has no mailing address on file.',
    })
    return
  }
  ctx.recipients.push(
    makeRecipient(contacts.nhDes.name, contacts.nhDes.mailingAddress, {
      roles: ['nh_des'],
      parcelIds: [],
      provenance: [contactProvenance(ctx, 'nh_des')],
      channelHint: 'first_class_mail',
    }),
  )
}

export async function resolveConditional(ctx: Context, signal: AbortSignal): Promise<void> {
  const contacts = await getRegionalContacts(ctx.tx, signal)
  if (asks(ctx, 'regional_impact_yes')) await resolveRegional(ctx, contacts)
  if (asks(ctx, 'des_within_500ft')) await resolveDes(ctx, contacts)
}
