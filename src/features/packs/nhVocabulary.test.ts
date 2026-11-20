import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RoleChecks } from '@/app/(staff)/staff/admin/users/RoleChecks'
import { ApprovalHint } from '@/app/(staff)/staff/records/redact/[versionId]/ApprovalHint'
import { exactDetail } from '@/components/staff/search/searchOptions'
import { CAPABILITIES } from '@/constants/capabilities'
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
})
