import { NoPermission } from '@/components/staff/NoPermission'
import { BOARD_HOME_TITLE, BOARD_REFUSAL_ACTION } from '@/features/boards/memberCopy'

const TOWN_HOME = { href: '/', label: 'Go to the town home page' }

export function BoardRefusal() {
  return <NoPermission title={BOARD_HOME_TITLE} action={BOARD_REFUSAL_ACTION} wayOut={TOWN_HOME} />
}
