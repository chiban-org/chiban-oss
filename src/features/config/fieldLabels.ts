import type { ConfigKind } from '@/features/config/kinds'

export const FIELD_LABELS: Partial<Record<ConfigKind, Readonly<Record<string, string>>>> = {
  local_code_amendment: {
    '/title': 'Title',
    '/codeSection': 'Code section',
    '/adoptingAuthority': 'Adopted by',
    '/adoptedOn': 'Adopted on',
    '/reviewBoardConfirmedOn': 'Confirmed by the building code review board on',
    '/stateText': 'State code text',
    '/townText': "Town's amended text",
  },
}
