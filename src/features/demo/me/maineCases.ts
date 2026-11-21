import { day, type MaineContext, noonOf } from '@/features/demo/me/maineContext'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import {
  applyCureProcedure,
  recordCureReturnReceipt,
  sendCureNotice,
} from '@/features/enforcement/cureNotices'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { recordFinding } from '@/features/enforcement/findings'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'

const SHORELAND_PARCEL = 'R07-007'
const SHORELAND_ADDRESS = '12 Pickerel Lane'

export async function designateMaineOfficer(ctx: MaineContext): Promise<void> {
  must(
    await designateEnforcementOfficer(
      ctx.db,
      ctx.cast.admin,
      {
        userId: ctx.plumber.userId,
        title: 'Code Enforcement Officer and Local Plumbing Inspector',
        adoptingAuthority: 'Select Board',
        adoptedOn: day(ctx, -400),
      },
      ctx.signal,
    ),
    'designate the code enforcement officer',
  )
}

export async function seedMaineShorelandCase(ctx: MaineContext): Promise<void> {
  const officer = ctx.plumber
  const parcel = must(
    await resolveParcelId(ctx.db, { value: SHORELAND_PARCEL }, ctx.signal),
    'case parcel',
  )
  const foundOn = day(ctx, -9)
  const opened = must(
    await openCase(
      ctx.db,
      officer,
      { parcelId: parcel.parcelId, locationText: SHORELAND_ADDRESS },
      ctx.signal,
      noonOf(foundOn),
    ),
    'open case',
  )
  must(
    await setCaseStatus(
      ctx.db,
      officer,
      { caseId: opened.caseId, to: 'investigating', expectedRowVersion: 1 },
      ctx.signal,
      noonOf(foundOn),
    ),
    'investigating',
  )
  const finding = must(
    await recordFinding(
      ctx.db,
      officer,
      {
        caseId: opened.caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Shoreland Zoning Ordinance, Section 15.P',
        facts: 'Trees were cut inside the 100-foot strip along Fernhollow Pond without a permit.',
        inspectionDate: foundOn,
      },
      ctx.signal,
      noonOf(foundOn),
    ),
    'finding',
  )
  must(
    await applyCureProcedure(
      ctx.db,
      officer,
      { caseId: opened.caseId, ruleKey: 'me.enf.cure' },
      ctx.signal,
    ),
    'cure procedure',
  )
  const sentOn = day(ctx, -6)
  const sent = must(
    await sendCureNotice(
      ctx.db,
      officer,
      {
        caseId: opened.caseId,
        findingIds: [finding.findingId],
        owner: { name: 'Quarrington, Tess', mailingAddress: 'PO Box 207, Fernhollow, ME 04000' },
        occupant: {
          name: 'Occupant',
          mailingAddress: `${SHORELAND_ADDRESS}, Fernhollow, ME 04000`,
        },
        sentOn,
        documentId: null,
      },
      ctx.signal,
      noonOf(sentOn),
    ),
    'cure notice',
  )
  const receivedOn = day(ctx, -3)
  must(
    await recordCureReturnReceipt(
      ctx.db,
      officer,
      { cureNoticeId: sent.ids[0] ?? '', receivedOn },
      ctx.signal,
      noonOf(receivedOn),
    ),
    'return receipt',
  )
}

export async function seedMaineFoaa(ctx: MaineContext): Promise<void> {
  const custodian = await actorFor(ctx.db, 'records', ctx.signal)
  const receivedOn = day(ctx, -4)
  const logged = must(
    await logRequest(
      ctx.db,
      custodian,
      {
        receivedOn,
        receivedVia: 'email',
        requesterName: 'Morgan Tilley',
        requesterContact: 'morgan.tilley@example.test',
        description: 'Shoreland permits issued on Fernhollow Pond since 2024',
      },
      ctx.signal,
      noonOf(receivedOn),
    ),
    'log FOAA request',
  )
  const respondedOn = day(ctx, -2)
  must(
    await recordFirstResponse(
      ctx.db,
      ctx.store,
      custodian,
      {
        requestId: logged.requestId,
        kind: 'acknowledged',
        respondedOn,
        clarification: 'Do you want permit applications as well as issued permits?',
      },
      ctx.signal,
      noonOf(respondedOn),
    ),
    'acknowledge FOAA request',
  )
}
