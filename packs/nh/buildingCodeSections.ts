import { NH_2021_EDITION_KEY, NH_2024_EDITION_KEY } from '@packs/nh/codeEditions'
import type { StateCodeSection } from '@/features/packs/schema'

const ICC = 'https://codes.iccsafe.org/content'
const CHAPTER_1 = 'chapter-1-scope-and-administration'
const CHAPTER_3 = 'chapter-3-building-planning'

interface EditionSource {
  edition: string
  editionKey: string
  irc: string
  ibc: string
}

const ICC_2021: EditionSource = {
  edition: '2021',
  editionKey: NH_2021_EDITION_KEY,
  irc: `${ICC}/IRC2021P2`,
  ibc: `${ICC}/IBC2021P2`,
}

const ICC_2024: EditionSource = {
  edition: '2024',
  editionKey: NH_2024_EDITION_KEY,
  irc: `${ICC}/IRC2024V1.0`,
  ibc: `${ICC}/IBC2024V1.0`,
}

type Entry = [section: string, title: string, topic: string, chapter?: string]

function sectionsOf(
  source: EditionSource,
  code: StateCodeSection['code'],
  entries: readonly Entry[],
): StateCodeSection[] {
  const base = code === 'IRC' ? source.irc : source.ibc
  return entries.map(([section, title, topic, chapter = CHAPTER_1]) => ({
    code,
    edition: source.edition,
    editionKey: source.editionKey,
    section,
    title,
    topic,
    sourceUrl: `${base}/${chapter}`,
  }))
}

export const NH_STATE_CODE_SECTIONS: readonly StateCodeSection[] = [
  ...sectionsOf(ICC_2021, 'IRC', [
    ['R105.1', 'Required', 'work without a required permit'],
    ['R109.3', 'Inspection requests', 'failure to call for inspection'],
    ['R110.1', 'Use and change of occupancy', 'occupancy without a certificate of occupancy'],
    ['R113.1', 'Unlawful acts', 'work in violation of the code'],
    ['R114.1', 'Authority', 'stop work order'],
    ['R312.1', 'Guards', 'missing or unsafe guards', CHAPTER_3],
    ['R314.1', 'General', 'smoke alarms', CHAPTER_3],
    ['R315.1', 'General', 'carbon monoxide alarms', CHAPTER_3],
  ]),
  ...sectionsOf(ICC_2021, 'IBC', [
    ['105.1', 'Required', 'work without a required permit'],
    ['110.3', 'Required inspections', 'failure to call for required inspections'],
    ['111.1', 'Change of occupancy', 'occupancy without a certificate of occupancy'],
    ['114.1', 'Unlawful acts', 'work in violation of the code'],
    ['115.1', 'Authority', 'stop work order'],
    ['116.1', 'Unsafe conditions', 'unsafe structures and equipment'],
  ]),
  ...sectionsOf(ICC_2024, 'IRC', [
    ['R109.3', 'Inspection requests', 'failure to call for inspection'],
    ['R110.1', 'Use and change of occupancy', 'occupancy without a certificate of occupancy'],
    ['R113.1', 'Unlawful acts', 'work in violation of the code'],
    ['R114.1', 'Authority', 'stop work order'],
  ]),
]
