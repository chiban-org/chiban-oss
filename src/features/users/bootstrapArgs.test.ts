import { describe, expect, it } from 'vitest'
import { parseBootstrapArgs } from '@/features/users/bootstrapArgs'

const base = ['--email', 'clerk@alderpond.example', '--name', 'Nell Newcomb', '--role', 'admin']

describe('parseBootstrapArgs', () => {
  it('reads email, name and role', () => {
    expect(parseBootstrapArgs(base)).toEqual({
      email: 'clerk@alderpond.example',
      name: 'Nell Newcomb',
      role: 'admin',
      'send-email': false,
    })
  })

  it('reads the send-email flag', () => {
    expect(parseBootstrapArgs([...base, '--send-email'])?.['send-email']).toBe(true)
  })

  it('refuses a role that does not exist', () => {
    expect(parseBootstrapArgs(['--email', 'a@b.co', '--name', 'A', '--role', 'wizard'])).toBeNull()
  })

  it('refuses a resident role', () => {
    expect(
      parseBootstrapArgs(['--email', 'a@b.co', '--name', 'A', '--role', 'applicant']),
    ).toBeNull()
  })

  it('refuses a missing field', () => {
    expect(parseBootstrapArgs(['--email', 'a@b.co', '--role', 'admin'])).toBeNull()
  })

  it('refuses a password on the command line', () => {
    expect(parseBootstrapArgs([...base, '--password', 'hunter2hunter2'])).toBeNull()
  })
})
