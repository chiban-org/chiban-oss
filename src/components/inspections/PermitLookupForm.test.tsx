// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PermitLookupForm } from '@/components/inspections/PermitLookupForm'

afterEach(cleanup)

const SMALL_TEXT = /^(?:(?:sm|md|lg|xl|2xl):)?text-(?:sm|xs)$/

describe('PermitLookupForm', () => {
  it('labels the permit number input', () => {
    render(<PermitLookupForm number="BP-2026-0001" />)
    const input = screen.getByRole('textbox', { name: 'Permit number' })
    expect((input as HTMLInputElement).value).toBe('BP-2026-0001')
  })

  it('keeps the permit number input at 16px at every breakpoint', () => {
    render(<PermitLookupForm number="" />)
    const classes = screen.getByRole('textbox', { name: 'Permit number' }).className.split(/\s+/)
    expect(classes.filter((c) => SMALL_TEXT.test(c))).toEqual([])
    expect(classes).toContain('text-base')
  })
})
