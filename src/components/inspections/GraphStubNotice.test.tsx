// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'

afterEach(cleanup)

describe('GraphStubNotice', () => {
  it('says no live tenant is connected', () => {
    render(<GraphStubNotice />)
    expect(screen.getByRole('note').textContent).toContain(
      'No live Microsoft 365 tenant is connected',
    )
  })
})
