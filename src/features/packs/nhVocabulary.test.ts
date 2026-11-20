import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RoleChecks } from '@/app/(staff)/staff/admin/users/RoleChecks'
import { ApprovalHint } from '@/app/(staff)/staff/records/redact/[versionId]/ApprovalHint'
import { exactDetail } from '@/components/staff/search/searchOptions'
import { CAPABILITIES } from '@/constants/capabilities'
import { appealStatusText } from '@/features/appeals/adminAppealsView'
import { appealToBoard, boardDecision } from '@/features/appeals/appealWords'
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
import {
  boardAbbrev,
  boardLabel,
  boardShort,
  governingBody,
  recordsLaw,
  recordsRequest,
} from '@/features/packs/vocabulary'
import { groupPortalTypes } from '@/features/portal/typeGroups'
import { holdTargetLabels } from '@/features/records/holdKinds'
import {
  dueThisWeekLabel,
  openRecordsLabel,
  overdueRequestsLabel,
} from '@/features/staffHome/recordsHome'
import { STAFF_NAV_ITEMS } from '@/features/staffNav/navEntries'
import { RTK_RESPONSE_KIND } from '@/features/templates/kinds/officeKinds'

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
    expect(
      renderToStaticMarkup(
        ApprovalHint({ requestId: undefined, recordHref: null, canPublish: true }),
      ),
    ).toContain(
      'A copy for a Right-to-Know request is approved in the release step on the request page.',
    )
    expect(
      renderToStaticMarkup(ApprovalHint({ requestId: 'r1', recordHref: null, canPublish: true })),
    ).toContain('A copy for this Right-to-Know request is approved in the release step on the')
    expect(renderToStaticMarkup(RoleChecks({ selected: [] }))).toContain(
      'Holds, retention, and Right-to-Know',
    )
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
    ).toContain('Not on the public site: Right-to-Know documents are never shown there.')
    expect(RTK_RESPONSE_KIND.label).toBe('Right-to-Know response')
    expect(RTK_RESPONSE_KIND.title).toBe('Response to your Right-to-Know request')
    expect(RTK_RESPONSE_KIND.record).toBe('Right-to-Know request')
  })

  it('boards and appeals', () => {
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
})
