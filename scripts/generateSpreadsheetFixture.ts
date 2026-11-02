import { mkdirSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

const DIR = path.resolve('src/test/fixtures/spreadsheet')
const FILE = path.join(DIR, 'alder-pond-permits.xlsx')

const HEADER = [
  'Map',
  'Lot',
  'Sub',
  'Unit',
  'Type',
  'Permit No',
  'Issued',
  'Work',
  'Contractor',
  'Fee',
  'Clerk Note',
]

type Issued = string | number | Date

const ROWS: [number, number, string, string, Issued, string, string, string, string][] = [
  [
    7,
    1,
    'Building',
    'B-1987-004',
    '3/4/87',
    'Replace barn roof',
    'Fernhollow Roofing',
    '85',
    'Ask abutter',
  ],
  [
    7,
    1,
    'Electrical',
    'E-1991-011',
    33239,
    'Service upgrade to 200 amp',
    'Wrenfield Electric',
    '40',
    '',
  ],
  [
    7,
    2,
    'Building',
    'B-1995-019',
    '06/12/1995',
    'Garage addition',
    'Marsh Wren Builders',
    '120',
    '',
  ],
  [
    7,
    2,
    'Plumbing',
    'P-1998-002',
    new Date(Date.UTC(1998, 8, 14)),
    'Replace water heater',
    'Quillbrook Plumbing',
    '35',
    '',
  ],
  [
    7,
    3,
    'Building',
    'B-2001-007',
    '2001-04-30',
    'Deck, 12 by 16 feet',
    'Owner',
    '60',
    'Plans on file',
  ],
  [7, 3, 'Septic', 'S-2003-001', '11/3/03', 'Replace leach field', 'Thistle Excavation', '150', ''],
  [7, 4, 'Building', 'B-2005-013', 38500, 'Woodshed', 'Owner', '25', ''],
  [
    7,
    4,
    'Demolition',
    'D-1986-001',
    '9/15/86',
    'Remove collapsed ice house',
    'Bramble Salvage',
    '30',
    '',
  ],
  [
    7,
    5,
    'Building',
    'B-1999-022',
    '12/1/1999',
    'Cranberry storage shed',
    'Pennywhistle Land Co',
    '75',
    '',
  ],
  [
    7,
    5,
    'Electrical',
    'E-2004-009',
    new Date(Date.UTC(2004, 1, 29)),
    'Barn wiring',
    'Wrenfield Electric',
    '45',
    '',
  ],
  [7, 6, 'Building', 'B-1989-005', '7/20/89', 'Kitchen remodel', 'Calla Thistledown', '90', ''],
  [
    7,
    6,
    'Plumbing',
    'P-2000-004',
    '2000-10-02',
    'Bathroom rough-in',
    'Quillbrook Plumbing',
    '35',
    '',
  ],
  [7, 7, 'Building', 'B-1993-016', 34150, 'Greenhouse', 'Hollowell Cranberry Trust', '55', ''],
  [
    7,
    7,
    'Mechanical',
    'M-2002-003',
    '5/9/02',
    'Furnace replacement',
    'Fernhollow Heating',
    '40',
    '',
  ],
  [7, 1, 'Sign', 'G-2000-001', '8/8/2000', 'Farm stand sign', 'Owner', '20', ''],
  [
    7,
    2,
    'Building',
    'B-1996-010',
    'sometime in the spring',
    'Porch repair',
    'Marsh Wren Builders',
    '50',
    'Date not legible in ledger',
  ],
  [
    99,
    1,
    'Building',
    'B-1994-030',
    '2/14/94',
    'Shed on a lot no longer in the tax map',
    'Owner',
    '30',
    'Parcel split in 1997',
  ],
  [7, 3, 'Fence', 'F-2006-002', '4/18/06', 'Split rail fence', 'Owner', '15', ''],
  [7, 5, 'Building', 'B-1985-001', '1/2/85', 'Chicken coop', 'Owner', '20', ''],
  [
    7,
    6,
    'Electrical',
    'E-2010-006',
    '2010-06-21',
    'Solar array hookup',
    'Wrenfield Electric',
    '60',
    '',
  ],
]

async function build(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date(Date.UTC(2026, 10, 1))
  workbook.modified = new Date(Date.UTC(2026, 10, 1))
  const sheet = workbook.addWorksheet('Permits')
  sheet.addRow(['Town of Alder Pond building permit ledger, transcribed'])
  sheet.addRow(HEADER)
  for (const [map, lot, type, no, issued, work, contractor, fee, note] of ROWS) {
    sheet.addRow([map, lot, 0, 0, type, no, issued, work, contractor, fee, note])
  }
  mkdirSync(DIR, { recursive: true })
  await workbook.xlsx.writeFile(FILE)
}

await build()
