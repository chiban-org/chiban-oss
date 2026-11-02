// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { generateTotpSecret, totpUri } from '@/features/auth/totp'
import { EnrollmentDetails } from './EnrollmentDetails'

afterEach(cleanup)

describe('EnrollmentDetails', () => {
  const secret = generateTotpSecret()
  const uri = totpUri(secret, 'clerk@example.test')

  it('shows the secret as text in groups so it can be typed without scanning', () => {
    render(<EnrollmentDetails uri={uri} qr="data:image/png;base64,AAAA" />)
    const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? ''
    expect(screen.getByText(grouped)).toBeTruthy()
  })

  it('offers the otpauth link for authenticator apps on the same device', () => {
    render(<EnrollmentDetails uri={uri} qr="data:image/png;base64,AAAA" />)
    expect(
      screen.getByRole('link', { name: /open in your authenticator app/i }).getAttribute('href'),
    ).toBe(uri)
  })

  it('keeps the QR image', () => {
    render(<EnrollmentDetails uri={uri} qr="data:image/png;base64,AAAA" />)
    expect(screen.getByAltText(/scan this qr code/i)).toBeTruthy()
  })
})
