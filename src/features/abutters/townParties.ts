import type { ResolverContext } from '@/features/abutters/municipalOffices'
import { capitalised } from '@/features/abutters/recipientRoleLabels'
import type { Provenance, Recipient } from '@/features/abutters/resolution'
import type { RecipientRole } from '@/features/abutters/roles'
import { boardForKind } from '@/features/boards/townBoards'
import { boardLabel, governingBody } from '@/features/packs/vocabulary'
import { loadTownProfile } from '@/features/pdf/documentFrame'

const TOWN_PARTY_ROLES = ['planning_board', 'municipal_officers'] as const
type TownPartyRole = (typeof TOWN_PARTY_ROLES)[number]

const MISSING_ADDRESS_DETAIL = 'Add the town office mailing address under Settings, Town profile.'

function isTownPartyRole(role: RecipientRole): role is TownPartyRole {
  return (TOWN_PARTY_ROLES as readonly string[]).includes(role)
}

async function partyName(ctx: ResolverContext, role: TownPartyRole): Promise<string> {
  if (role === 'municipal_officers') return capitalised(governingBody())
  const board = await boardForKind(ctx.tx, 'planning_board', ctx.signal)
  return board?.name ?? boardLabel('planning_board')
}

async function townOfficeAddress(ctx: ResolverContext): Promise<string | null> {
  const profile = await loadTownProfile(ctx.tx, ctx.signal)
  if (profile === null) return null
  const lines = profile.addressLines.map((line) => line.trim()).filter((line) => line !== '')
  return lines.length === 0 ? null : lines.join(', ')
}

export async function resolveTownParties(
  ctx: ResolverContext,
  roles: RecipientRole[],
): Promise<Recipient[]> {
  const requested = roles.filter(isTownPartyRole)
  if (requested.length === 0) return []
  const mailingAddress = await townOfficeAddress(ctx)
  const out: Recipient[] = []
  for (const role of requested) {
    if (mailingAddress === null) {
      ctx.incomplete.push({
        code: 'regional_contacts_missing',
        detail: MISSING_ADDRESS_DETAIL,
        role,
      })
      continue
    }
    const provenance: Provenance = {
      source: 'staff_entry',
      ref: 'town_profile',
      asOf: null,
      ageDays: null,
      state: 'entered',
    }
    out.push({
      key: '',
      roles: [role],
      name: await partyName(ctx, role),
      mailingAddress,
      parcelIds: [],
      channelHint: 'first_class_mail',
      status: 'ok',
      provenance: [provenance],
    })
  }
  return out
}
