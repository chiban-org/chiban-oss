import { NH_CURRENT_EDITION_KEY } from '@packs/nh/codeEditions'

export interface StateCodeSection {
  code: 'IRC' | 'IBC'
  edition: string
  editionKey: string
  section: string
  title: string
  topic: string
  sourceUrl: string
}

const IRC_2021_CH1 =
  'https://codes.iccsafe.org/content/IRC2021P2/chapter-1-scope-and-administration'
const IRC_2021_CH3 = 'https://codes.iccsafe.org/content/IRC2021P2/chapter-3-building-planning'
const IBC_2021_CH1 =
  'https://codes.iccsafe.org/content/IBC2021P2/chapter-1-scope-and-administration'

const irc = (section: string, title: string, topic: string, sourceUrl = IRC_2021_CH1) => ({
  code: 'IRC' as const,
  edition: '2021',
  editionKey: NH_CURRENT_EDITION_KEY,
  section,
  title,
  topic,
  sourceUrl,
})

const ibc = (section: string, title: string, topic: string) => ({
  code: 'IBC' as const,
  edition: '2021',
  editionKey: NH_CURRENT_EDITION_KEY,
  section,
  title,
  topic,
  sourceUrl: IBC_2021_CH1,
})

export const NH_STATE_CODE_SECTIONS: readonly StateCodeSection[] = [
  irc('R105.1', 'Required', 'work without a required permit'),
  irc('R109.3', 'Inspection requests', 'failure to call for inspection'),
  irc('R110.1', 'Use and change of occupancy', 'occupancy without a certificate of occupancy'),
  irc('R113.1', 'Unlawful acts', 'work in violation of the code'),
  irc('R114.1', 'Authority', 'stop work order'),
  irc('R312.1', 'Guards', 'missing or unsafe guards', IRC_2021_CH3),
  irc('R314.1', 'General', 'smoke alarms', IRC_2021_CH3),
  irc('R315.1', 'General', 'carbon monoxide alarms', IRC_2021_CH3),
  ibc('105.1', 'Required', 'work without a required permit'),
  ibc('110.3', 'Required inspections', 'failure to call for required inspections'),
  ibc('111.1', 'Change of occupancy', 'occupancy without a certificate of occupancy'),
  ibc('114.1', 'Unlawful acts', 'work in violation of the code'),
  ibc('115.1', 'Authority', 'stop work order'),
  ibc('116.1', 'Unsafe conditions', 'unsafe structures and equipment'),
]

export function stateCodeReference(entry: StateCodeSection): string {
  return `${entry.code} ${entry.edition} Section ${entry.section}`
}
