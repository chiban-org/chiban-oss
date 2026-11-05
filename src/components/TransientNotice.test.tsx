// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TransientNotice } from '@/components/TransientNotice'

afterEach(cleanup)

describe('TransientNotice', () => {
  it('shows its message until any form on the page is submitted, then stays gone', () => {
    render(
      <>
        <TransientNotice>Invite sent. The link works once for 7 days.</TransientNotice>
        <form aria-label="Roles" />
      </>,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Invite sent. The link works once for 7 days.',
    )
    fireEvent.submit(screen.getByRole('form', { name: 'Roles' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
