// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { SubmitButton } from '@/components/SubmitButton'

afterEach(cleanup)

describe('SubmitButton', () => {
  it('is disabled in the markup sent before hydration so an early click cannot be lost', () => {
    const html = renderToStaticMarkup(
      <form>
        <SubmitButton>Continue</SubmitButton>
      </form>,
    )
    expect(html).toContain('disabled')
  })

  it('is enabled once the page has hydrated', () => {
    render(
      <form>
        <SubmitButton>Continue</SubmitButton>
      </form>,
    )
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(false)
  })
})
