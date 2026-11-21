// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_ORDER_TEXT } from '@/features/enforcement/orderAvailability'
import { setActivePackForTest } from '@/features/packs/registry'
import { ALL_CAN, renderForm, stubDetail } from '@/test/enforcementRender'
import { XX_NO_ORDERS } from '@/test/packs/xx/noOrders'

vi.mock('../orderActions', () => ({
  discardDraftOrderAction: vi.fn(),
  draftOrderAction: vi.fn(),
  issueOrderAction: vi.fn(),
  reviseDraftOrderAction: vi.fn(),
}))

const { OrdersSection } = await import('./OrdersSection')

afterEach(() => {
  cleanup()
  setActivePackForTest(null)
})

const finding = {
  id: 'f1',
  provisionKind: 'zoning_ordinance',
  provisionRef: 'Section 4.2',
  status: 'open',
}

describe('the orders section in a pack with no statutory order', () => {
  it('offers no draft and says to send a notice of violation instead', () => {
    setActivePackForTest(XX_NO_ORDERS)
    renderForm(<OrdersSection detail={stubDetail({ findings: [finding] })} can={ALL_CAN} />)
    expect(screen.queryByText('Draft an order')).toBeNull()
    expect(screen.getByText(NO_ORDER_TEXT)).toBeTruthy()
  })

  it('still offers a draft under the default pack', () => {
    renderForm(<OrdersSection detail={stubDetail({ findings: [finding] })} can={ALL_CAN} />)
    expect(screen.getByText('Draft an order')).toBeTruthy()
    expect(screen.queryByText(NO_ORDER_TEXT)).toBeNull()
  })
})
