import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildCamaCsv, encodeWindows1252 } from '../src/test/fixtureBuilders/camaFixture.ts'

const DIR = path.resolve('src/test/fixtures/cama')

mkdirSync(DIR, { recursive: true })
writeFileSync(path.join(DIR, 'alder-pond-cama.csv'), buildCamaCsv(false))
writeFileSync(path.join(DIR, 'alder-pond-cama-1252.csv'), encodeWindows1252(buildCamaCsv(true)))
