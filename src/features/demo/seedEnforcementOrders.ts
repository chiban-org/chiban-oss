import { recordCounterPayment } from '@/features/counter/counterPayment'
import {
  caseDocument,
  type EnforcementSeedContext,
  must,
} from '@/features/demo/seedEnforcementSupport'
import { recordEnforcementAppeal } from '@/features/enforcement/appeals'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { recordCourtStep } from '@/features/enforcement/courtSteps'
import { recordFinding } from '@/features/enforcement/findings'
import { recordFine } from '@/features/enforcement/fines'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import { listRecipient, recordRoleCheck, recordServiceEvent } from '@/features/enforcement/service'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import type { CivilDate } from '@/types/civilDate'

interface IssuedCase {
  caseId: string
  orderId: string
  number: string
}

async function issuedOrderCase(
  ctx: EnforcementSeedContext,
  input: { location: string; parcel?: string; issuedOffset: number; ceaseImmediately?: boolean },
): Promise<IssuedCase> {
  const { db, signal, staff } = ctx
  const parcelId =
    input.parcel === undefined
      ? undefined
      : must(await resolveParcelId(db, { value: input.parcel }, signal), 'parcel').parcelId
  const opened = must(
    await openCase(
      db,
      staff,
      { locationText: input.location, ...(parcelId === undefined ? {} : { parcelId }) },
      signal,
      ctx.now,
    ),
    'open case',
  )
  const { caseId } = opened
  must(
    await setCaseStatus(
      db,
      staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
      ctx.now,
    ),
    'investigate',
  )
  const finding = must(
    await recordFinding(
      db,
      staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Zoning Ordinance Section 6.1, uses allowed in the district',
        facts: 'A second dwelling is being rented in a building approved for one dwelling.',
        inspectionDate: ctx.day(input.issuedOffset - 7),
      },
      signal,
      ctx.now,
    ),
    'finding',
  )
  const drafted = must(
    await draftOrder(
      db,
      staff,
      {
        caseId,
        findingIds: [finding.findingId],
        correctiveAction: 'Stop renting the second dwelling or apply for the required approval.',
        correctiveDeadline: ctx.day(input.issuedOffset + 45),
        ceaseImmediately: input.ceaseImmediately ?? false,
      },
      signal,
      ctx.now,
    ),
    'draft order',
  )
  must(
    await issueOrder(
      db,
      ctx.store,
      staff,
      { orderId: drafted.orderId, issuedOn: ctx.day(input.issuedOffset), expectedRowVersion: 1 },
      signal,
      ctx.now,
    ),
    'issue order',
  )
  return { caseId, orderId: drafted.orderId, number: drafted.number }
}

async function check(
  ctx: EnforcementSeedContext,
  orderId: string,
  role:
    | 'record_owner'
    | 'taxpayer'
    | 'occupying_tenant'
    | 'person_in_control'
    | 'mortgagee_of_record',
  outcome: 'recipients_listed' | 'none_exist' | 'same_as_owner' | 'owner_not_found',
  basis: string,
  on: CivilDate,
): Promise<void> {
  must(
    await recordRoleCheck(
      ctx.db,
      ctx.staff,
      { orderId, role, outcome, basis, checkedOn: on },
      ctx.signal,
    ),
    `role check ${role}`,
  )
}

async function owner(
  ctx: EnforcementSeedContext,
  orderId: string,
  name: string,
  address: string,
  source: string,
): Promise<string> {
  return must(
    await listRecipient(
      ctx.db,
      ctx.staff,
      { orderId, role: 'record_owner', name, address, source },
      ctx.signal,
    ),
    'owner',
  ).recipientId
}

async function inHand(
  ctx: EnforcementSeedContext,
  input: { caseId: string; orderId: string; recipientId: string; on: CivilDate },
): Promise<void> {
  const proof = await caseDocument(ctx, {
    caseId: input.caseId,
    title: 'Return of service',
    docKind: 'service_proof',
  })
  must(
    await recordServiceEvent(
      ctx.db,
      ctx.staff,
      {
        orderId: input.orderId,
        recipientId: input.recipientId,
        method: 'in_hand',
        servedOn: input.on,
        serverName: 'Deputy Marsh',
        serverRole: 'deputy_sheriff',
        proofDocumentId: proof,
      },
      ctx.signal,
      ctx.now,
    ),
    'service in hand',
  )
}

async function listedRoles(ctx: EnforcementSeedContext, orderId: string, on: CivilDate) {
  await check(
    ctx,
    orderId,
    'taxpayer',
    'same_as_owner',
    'The tax bill is mailed to the owner of record',
    on,
  )
  await check(
    ctx,
    orderId,
    'person_in_control',
    'none_exist',
    'Site visit found no one else in control',
    on,
  )
}

export async function seedServedCase(ctx: EnforcementSeedContext): Promise<void> {
  const issued = await issuedOrderCase(ctx, {
    location: '8 Loon Point Road',
    parcel: '007001000000',
    issuedOffset: -9,
  })
  const on = ctx.day(-6)
  const ownerId = await owner(
    ctx,
    issued.orderId,
    'Casey Landlord',
    '8 Loon Point Road',
    'CAMA owner',
  )
  must(
    await listRecipient(
      ctx.db,
      ctx.staff,
      {
        orderId: issued.orderId,
        role: 'occupying_tenant',
        name: 'Robin Renter',
        address: '8 Loon Point Road, upstairs',
        source: 'Site visit',
      },
      ctx.signal,
    ),
    'tenant',
  )
  await check(ctx, issued.orderId, 'record_owner', 'recipients_listed', 'CAMA owner of record', on)
  await check(
    ctx,
    issued.orderId,
    'occupying_tenant',
    'recipients_listed',
    'Tenant seen on site',
    on,
  )
  await check(
    ctx,
    issued.orderId,
    'mortgagee_of_record',
    'none_exist',
    'Registry search found no mortgage',
    on,
  )
  await listedRoles(ctx, issued.orderId, on)
  await inHand(ctx, { caseId: issued.caseId, orderId: issued.orderId, recipientId: ownerId, on })
}

export async function seedNotFoundCase(ctx: EnforcementSeedContext): Promise<void> {
  const issued = await issuedOrderCase(ctx, { location: '41 Mill Brook Lane', issuedOffset: -45 })
  const on = ctx.day(-44)
  await owner(
    ctx,
    issued.orderId,
    'Owner of record, address unknown',
    'Unknown',
    'Registry book 1234 page 56',
  )
  await check(
    ctx,
    issued.orderId,
    'record_owner',
    'owner_not_found',
    'Mail was returned and the registry lists no forwarding address',
    on,
  )
  await check(ctx, issued.orderId, 'occupying_tenant', 'none_exist', 'The building is vacant', on)
  await check(
    ctx,
    issued.orderId,
    'mortgagee_of_record',
    'none_exist',
    'Registry search found no mortgage',
    on,
  )
  await listedRoles(ctx, issued.orderId, on)
  const events: [CivilDate, 'posting_on_property' | 'newspaper_publication'][] = [
    [ctx.day(-40), 'posting_on_property'],
    [ctx.day(-38), 'newspaper_publication'],
    [ctx.day(-31), 'newspaper_publication'],
    [ctx.day(-24), 'newspaper_publication'],
    [ctx.day(-17), 'newspaper_publication'],
  ]
  for (const [servedOn, method] of events) {
    const proof = await caseDocument(ctx, {
      caseId: issued.caseId,
      title: method === 'posting_on_property' ? 'Affidavit of posting' : 'Newspaper tear sheet',
      docKind: 'service_proof',
    })
    must(
      await recordServiceEvent(
        ctx.db,
        ctx.staff,
        {
          orderId: issued.orderId,
          recipientId: null,
          method,
          servedOn,
          ...(method === 'newspaper_publication' ? { newspaper: 'Alder Pond Gazette' } : {}),
          proofDocumentId: proof,
        },
        ctx.signal,
        ctx.now,
      ),
      'posting and publication',
    )
  }
}

export async function seedStayedCase(ctx: EnforcementSeedContext): Promise<void> {
  const issued = await issuedOrderCase(ctx, { location: '5 Cedar Hill Road', issuedOffset: -60 })
  const on = ctx.day(-55)
  const ownerId = await owner(
    ctx,
    issued.orderId,
    'Drew Homeowner',
    '5 Cedar Hill Road',
    'CAMA owner',
  )
  await check(ctx, issued.orderId, 'record_owner', 'recipients_listed', 'CAMA owner of record', on)
  await check(
    ctx,
    issued.orderId,
    'occupying_tenant',
    'none_exist',
    'Owner occupies the property',
    on,
  )
  await check(
    ctx,
    issued.orderId,
    'mortgagee_of_record',
    'none_exist',
    'Registry search found no mortgage',
    on,
  )
  await listedRoles(ctx, issued.orderId, on)
  await inHand(ctx, { caseId: issued.caseId, orderId: issued.orderId, recipientId: ownerId, on })
  must(
    await recordEnforcementAppeal(
      ctx.db,
      ctx.staff,
      {
        caseId: issued.caseId,
        targetKind: 'order',
        targetId: issued.orderId,
        filedOn: ctx.day(-20),
        appellantName: 'Drew Homeowner',
      },
      ctx.signal,
      ctx.now,
    ),
    'appeal',
  )
}

export async function seedCourtCase(ctx: EnforcementSeedContext): Promise<void> {
  const issued = await issuedOrderCase(ctx, { location: '17 Osprey Landing', issuedOffset: -200 })
  const on = ctx.day(-190)
  const ownerId = await owner(
    ctx,
    issued.orderId,
    'Sam Shorefront',
    '17 Osprey Landing',
    'CAMA owner',
  )
  await check(ctx, issued.orderId, 'record_owner', 'recipients_listed', 'CAMA owner of record', on)
  await check(
    ctx,
    issued.orderId,
    'occupying_tenant',
    'none_exist',
    'Owner occupies the property',
    on,
  )
  await check(
    ctx,
    issued.orderId,
    'mortgagee_of_record',
    'none_exist',
    'Registry search found no mortgage',
    on,
  )
  await listedRoles(ctx, issued.orderId, on)
  await inHand(ctx, { caseId: issued.caseId, orderId: issued.orderId, recipientId: ownerId, on })
  const step = async (
    kind: 'filed_with_clerk' | 'motion_to_enforce' | 'judgment',
    offset: number,
  ) => {
    const document = await caseDocument(ctx, {
      caseId: issued.caseId,
      title:
        kind === 'judgment'
          ? 'Judgment'
          : kind === 'filed_with_clerk'
            ? 'Filed order'
            : 'Motion to enforce',
      docKind: 'court_document',
    })
    return must(
      await recordCourtStep(
        ctx.db,
        ctx.staff,
        {
          orderId: issued.orderId,
          kind,
          occurredOn: ctx.day(offset),
          court: 'District Court, Alder Pond Division',
          docket: '2026-CV-0142',
          documentId: document,
          ...(kind === 'judgment' ? { judgmentOutcome: 'affirmed' as const } : {}),
        },
        ctx.signal,
        ctx.now,
      ),
      `court step ${kind}`,
    )
  }
  await step('filed_with_clerk', -170)
  await step('motion_to_enforce', -160)
  const judgment = await step('judgment', -120)
  const fine = must(
    await recordFine(
      ctx.db,
      ctx.finance,
      {
        caseId: issued.caseId,
        orderId: issued.orderId,
        kind: 'civil_penalty',
        ruleKey: 'nh.enf.penalty_zoning',
        amountCents: 27500,
        imposedOn: ctx.day(-120),
        court: 'District Court, Alder Pond Division',
        docket: '2026-CV-0142',
        judgmentStepId: judgment.stepId,
      },
      ctx.signal,
      ctx.now,
    ),
    'fine',
  )
  must(
    await recordCounterPayment(
      ctx.db,
      ctx.finance,
      {
        method: 'cash',
        amountCents: 20000,
        payerName: 'Sam Shorefront',
        allocations: [{ targetKind: 'fine', fineId: fine.fineId, amountCents: 20000 }],
      },
      ctx.signal,
      ctx.now,
    ),
    'fine payment',
  )
  const referral = must(
    await referToCounsel(
      ctx.db,
      ctx.store,
      ctx.staff,
      {
        caseId: issued.caseId,
        counselName: 'Attorney Rivera',
        purpose: 'motion_to_enforce',
        referredOn: ctx.day(-168),
      },
      ctx.signal,
      ctx.now,
    ),
    'referral',
  )
  for (const [kind, offset] of [
    ['motion_filed', -160],
    ['judgment_for_town', -120],
  ] as const) {
    must(
      await recordCounselOutcome(
        ctx.db,
        ctx.staff,
        {
          referralId: referral.referralId,
          kind,
          occurredOn: ctx.day(offset),
          court: 'District Court, Alder Pond Division',
        },
        ctx.signal,
      ),
      `outcome ${kind}`,
    )
  }
}
