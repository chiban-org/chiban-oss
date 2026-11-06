import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const CLIENT_FILES = [
  'account/AccountForms.tsx',
  'account/TotpForms.tsx',
  'admin/users/invite/InviteForm.tsx',
]

it.each(CLIENT_FILES)('%s does not import a server validation module', (file) => {
  const source = readFileSync(join(__dirname, '..', file), 'utf8')
  expect(source).not.toMatch(/from '(\.\.?\/)+forms'/)
})
