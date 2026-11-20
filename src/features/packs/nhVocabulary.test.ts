import { describe, expect, it } from 'vitest'
import { roleHints } from '@/app/(staff)/staff/admin/users/RoleChecks'
import { meetingsTaskText, recordsTaskText } from '@/components/public/HomeContent'
import { exactDetail } from '@/components/staff/search/searchOptions'
import { CAPABILITIES } from '@/constants/capabilities'
import { appealStatusText } from '@/features/appeals/adminAppealsView'
import {
  appealPointer,
  appealResultLabel,
  appealStepHint,
  appealsLead,
  appealToBoard,
  boardDecision,
  linkedPlanningDecisionLabel,
  recordDecisionDescription,
} from '@/features/appeals/appealWords'
import { activityPhrase } from '@/features/applications/activityPhrase'
import { statePermitAtFiling } from '@/features/applications/documentItemSchema'
import {
  certificationOptions,
  certificationPhrase,
  requestToGoverningBody,
} from '@/features/boards/certificationWords'
import { toGraphNodes } from '@/features/decisions/decisionView'
import { documentKindLabel } from '@/features/documents/recordSource'
import { whoCanSeeSentence } from '@/features/documents/whoCanSee'
import { nextStepOf } from '@/features/enforcement/caseNextStep'
import { appealedToBoardText } from '@/features/enforcement/counselSectionBlocks'
import { restraintIssuer, restraintIssuerOptions } from '@/features/enforcement/restraintWords'
import { stayBanner } from '@/features/enforcement/stay'
import { actorLabel } from '@/features/enforcement/workPlan'
import { stayStepTask } from '@/features/enforcement/workPlanSteps'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import {
  boardAbbrev,
  boardLabel,
  boardShort,
  governingBody,
  recordsLaw,
  recordsRequest,
} from '@/features/packs/vocabulary'
import { groupPortalTypes } from '@/features/portal/typeGroups'
import { holdTargetLabels, holdTargetOptions } from '@/features/records/holdKinds'
import {
  logRequestTitle,
  receivedThanks,
  redactPurposeOptions,
  releaseHintForRequest,
  releaseHintWithoutRequest,
  requestsNoPermissionAction,
  requestsTitle,
} from '@/features/rtk/requestCopy'
import {
  dueThisWeekLabel,
  openRecordsLabel,
  overdueRequestsLabel,
} from '@/features/staffHome/recordsHome'
import { STAFF_NAV_ITEMS } from '@/features/staffNav/navEntries'
import { RTK_RESPONSE_KIND } from '@/features/templates/kinds/officeKinds'
import { MERGE_FIELD_LABELS } from '@/features/templates/mergeFieldLabels'

describe('New Hampshire vocabulary through the pack', () => {
  it('names the pack words', () => {
    expect(recordsLaw()).toBe('Right-to-Know')
    expect(recordsRequest()).toBe('Right-to-Know request')
    expect(governingBody()).toBe('selectmen')
    expect(boardShort('zba')).toBe('Zoning Board')
    expect(boardAbbrev('zba')).toBe('ZBA')
    expect(boardLabel('zba')).toBe('Zoning Board of Adjustment')
    expect(boardShort('planning_board')).toBe('Planning Board')
    expect(boardAbbrev('planning_board')).toBe('Planning Board')
  })

  it('records navigation, capabilities and home', () => {
    expect(STAFF_NAV_ITEMS.find((i) => i.href === '/staff/records/requests')?.label).toBe(
      'Right-to-Know',
    )
    expect(CAPABILITIES['rtk.manage']).toBe(
      'Log Right-to-Know requests, respond, withhold, and release records',
    )
    expect(overdueRequestsLabel()).toBe('Right-to-Know requests past their response day')
    expect(dueThisWeekLabel()).toBe('Right-to-Know requests due this week')
    expect(openRecordsLabel()).toBe('Open Right-to-Know')
    expect(holdTargetLabels().rtk_request).toBe('Right-to-Know request')
    expect(documentKindLabel('rtk_letter')).toBe('Right-to-Know letter')
    expect(exactDetail('request')).toBe('Right-to-Know request')
  })

  it('records screens', () => {
    expect(releaseHintWithoutRequest()).toBe(
      'A copy for a Right-to-Know request is approved in the release step on the request page.',
    )
    expect(releaseHintForRequest()).toBe(
      'A copy for this Right-to-Know request is approved in the release step on the',
    )
    expect(roleHints().records_custodian).toBe('Holds, retention, and Right-to-Know')
    expect(requestsTitle()).toBe('Right-to-Know requests')
    expect(requestsNoPermissionAction()).toBe('see Right-to-Know requests')
    expect(receivedThanks()).toBe('Thank you. The town has your Right-to-Know request.')
    expect(logRequestTitle()).toBe('Log a Right-to-Know request')
    expect(redactPurposeOptions()).toEqual([
      ['public', 'The public website'],
      ['rtk_release', 'A Right-to-Know request'],
    ])
    expect(holdTargetOptions()).toEqual([
      ['project', 'Project'],
      ['application', 'Application'],
      ['document', 'Document'],
      ['enforcement_case', 'Enforcement case'],
      ['rtk_request', 'Right-to-Know request'],
    ])
  })

  it('document visibility and templates', () => {
    expect(
      whoCanSeeSentence({
        recordKind: 'rtk_request',
        audiences: [],
        isPublic: false,
        rendition: { kind: 'none' },
        approvedRole: null,
        caseIsPublic: null,
        parcelId: null,
      } as never),
    ).toBe(
      'Town staff only. Not on the public site: Right-to-Know documents are never shown there.',
    )
    expect(RTK_RESPONSE_KIND.label).toBe('Right-to-Know response')
    expect(RTK_RESPONSE_KIND.title).toBe('Response to your Right-to-Know request')
    expect(RTK_RESPONSE_KIND.record).toBe('Right-to-Know request')
  })

  it('boards and appeals', () => {
    expect(appealStepHint()).toBe(
      'For an appeal to the Zoning Board. An appeal of an issued permit suspends it.',
    )
    expect(appealResultLabel()).toBe('Result, for a Zoning Board or rehearing decision')
    expect(linkedPlanningDecisionLabel()).toBe(
      'Is this the Zoning Board part of a Planning Board decision?',
    )
    expect(recordDecisionDescription()).toBe(
      'A decision by the building inspector, zoning administrator or another town official on an application or permit. Recording it starts the time to appeal it to the Zoning Board.',
    )
    expect(appealsLead()).toBe(
      'Decisions by the building inspector, zoning administrator or another town official that can be appealed to the Zoning Board.',
    )
    expect(appealPointer()).toBe(
      'To appeal a decision by the building inspector or zoning administrator to the Zoning Board,',
    )
    expect(appealToBoard()).toBe('Appeal to the Zoning Board')
    expect(boardDecision()).toBe('Zoning Board decision')
    const nodes = toGraphNodes([
      { id: 'a', kind: 'zba_decision', occurredOn: '2026-01-02' },
      { id: 'b', kind: 'zba_appeal', occurredOn: '2026-01-03' },
      { id: 'c', kind: 'pb_decision', occurredOn: '2026-01-04' },
    ] as never)
    expect(nodes.map((n) => n.kindLabel)).toEqual([
      'Zoning Board decision',
      'Appeal to the Zoning Board',
      'Planning Board decision',
    ])
    expect(
      appealStatusText(
        { occurredOn: '2026-01-02' } as never,
        { occurredOn: '2026-02-03' } as never,
        '2026-03-01' as never,
      ),
    ).toBe('Appealed to the Zoning Board on February 3, 2026')
    expect(statePermitAtFiling()).toBe(
      'A Planning Board or ZBA application cannot require a state or federal permit to file. Move this document to before the decision.',
    )
    expect(
      groupPortalTypes([
        { key: 'a', label: 'A', classification: 'nh.zba_variance' },
        { key: 'b', label: 'B', classification: 'nh.pb_site_plan' },
      ]).groups.map((g) => g.title),
    ).toEqual(['Planning Board', 'Zoning Board'])
  })

  it('selectmen certification', () => {
    expect(requestToGoverningBody()).toBe('Record a request to the selectmen')
    expect(certificationOptions()).toEqual([
      ['pending', 'Requested, waiting'],
      ['certified', 'Certified by the selectmen'],
      ['refused', 'The selectmen refused'],
    ])
    expect(certificationPhrase('pending')).toBe('requested, waiting on the selectmen')
    expect(certificationPhrase('certified')).toBe('certified by the selectmen')
    expect(certificationPhrase('refused')).toBe('the selectmen refused')
    expect(activityPhrase('board.certification.pending', null)).toBe(
      'Recorded a request to the selectmen',
    )
    expect(activityPhrase('board.certification.certified', null)).toBe(
      'Recorded the selectmen certifying the request',
    )
    expect(activityPhrase('board.certification.refused', null)).toBe(
      'Recorded the selectmen refusing the request',
    )
  })

  it('enforcement', () => {
    expect(restraintIssuer('zba')).toBe('the ZBA')
    expect(restraintIssuer('superior_court')).toBe('the superior court')
    expect(restraintIssuerOptions()).toEqual([
      ['zba', 'The ZBA'],
      ['superior_court', 'The superior court'],
    ])
    expect(nextStepOf({ now: { actor: 'zba', ask: 'Decide the appeal' } } as never)).toEqual({
      actor: 'ZBA',
      ask: 'decide the appeal',
    })
    expect(actorLabel({ actor: 'zba' } as never, null)).toBe('Zoning Board of Adjustment')
    expect(stayStepTask()).toBe('Wait for the ZBA decision')
    expect(stayBanner({ reason: 'appeal_pending' } as never, '2026-01-02' as never, null)).toBe(
      'Enforcement stayed by appeal to the ZBA filed January 2, 2026 (RSA 676:6).',
    )
    expect(stayBanner({ reason: 'none' } as never, null, '2026-01-02' as never)).toBe(
      'Not stayed: the officer certified imminent peril on January 2, 2026. Only a restraining order from the ZBA or the superior court stops these proceedings.',
    )
    expect(
      appealedToBoardText('Notice of violation', 'A. Person', '2026-01-02', 'unresolved'),
    ).toBe('Notice of violation appealed to the ZBA by A. Person on January 2, 2026, unresolved.')
  })

  it('notification wording and merge fields', () => {
    expect(DEFAULT_WORDING.rtk_request_received.subject).toBe(
      'Right-to-Know request {{request.number}} received',
    )
    expect(DEFAULT_WORDING.rtk_request_received.body).toBe(
      'The town received your Right-to-Know request on {{request.receivedOn}}. Its number is {{request.number}}.\n\nThe town will answer by {{request.due}}. It will make the records available, deny the request in writing, or tell you in writing when it will answer.\n\nKeep the request number if you need to ask about it.',
    )
    expect(DEFAULT_WORDING.rtk_letter_sent.subject).toBe(
      'Letter about Right-to-Know request {{request.number}}',
    )
    expect(DEFAULT_WORDING.rtk_letter_sent.body).toBe(
      "The town's letter about your Right-to-Know request {{request.number}} is attached.",
    )
    expect(DEFAULT_WORDING.rtk_records_link.body).toBe(
      'The town released records for your Right-to-Know request {{request.number}} on {{records.releasedOn}}.{{records.linkNote}} The link works for {{link.days}} days.',
    )
    expect(DEFAULT_WORDING.rtk_records_attached.body).toBe(
      "The town released records for your Right-to-Know request {{request.number}} on {{records.releasedOn}}. The records and the town's letter are attached.",
    )
    expect(MERGE_FIELD_LABELS['signer.zba_chair.name']).toBe(
      'Zoning Board of Adjustment chair name',
    )
    expect(MERGE_FIELD_LABELS['signer.zba_chair.title']).toBe(
      'Zoning Board of Adjustment chair title',
    )
  })

  it('home page', () => {
    expect(meetingsTaskText()).toBe(
      'Upcoming Planning Board and Zoning Board meetings, their agendas, minutes, and decisions.',
    )
    expect(recordsTaskText()).toBe(
      'Make a Right-to-Know request for public records the town keeps.',
    )
  })
})
