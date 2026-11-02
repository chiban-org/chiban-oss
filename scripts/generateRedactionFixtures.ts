import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  PDFDocument,
  PDFName,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  StandardFonts,
  setTextRenderingMode,
  TextRenderingMode,
} from 'pdf-lib'
import sharp from 'sharp'

const OUT = path.resolve('src/test/fixtures/redaction')
const PHONE = '603-555-0147'

async function letter(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Letter about ${PHONE}`)
  doc.setAuthor('Town of Alder Pond')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([612, 792])
  page.drawText(`Owner phone ${PHONE}`, { x: 72, y: 700, size: 14, font })
  page.drawText('Permit BP-2027-0001', { x: 72, y: 640, size: 14, font })
  page.drawText('Inspection scheduled for the week of March 8', { x: 72, y: 580, size: 12, font })
  const annotation = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [400, 700, 420, 720],
    Contents: PDFString.of(`Call the owner at ${PHONE}`),
    Open: false,
  })
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annotation)]))
  return await doc.save({ useObjectStreams: false })
}

async function scannedWithOcr(): Promise<Uint8Array> {
  const ink = await sharp({
    create: { width: 300, height: 60, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 240, height: 24, channels: 3, background: { r: 20, g: 20, b: 20 } },
        })
          .png()
          .toBuffer(),
        left: 30,
        top: 18,
      },
    ])
    .png()
    .toBuffer()
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const image = await doc.embedPng(ink)
  const page = doc.addPage([612, 792])
  page.drawImage(image, { x: 72, y: 600, width: 300, height: 60 })
  page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
  page.drawText(PHONE, { x: 102, y: 618, size: 24, font })
  page.pushOperators(popGraphicsState())
  return await doc.save({ useObjectStreams: false })
}

function exifWithThumbnail(thumbnail: Buffer): Buffer {
  const u16 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff])
  const u32 = (n: number) =>
    Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff])
  const entry = (tag: number, type: number, count: number, value: Buffer) =>
    Buffer.concat([u16(tag), u16(type), u32(count), value])
  const rational = (n: number, d: number) => Buffer.concat([u32(n), u32(d)])
  const lat = Buffer.concat([rational(43, 1), rational(12, 1), rational(30, 1)])
  const lon = Buffer.concat([rational(71, 1), rational(30, 1), rational(15, 1)])
  const header = Buffer.concat([Buffer.from('II*\0'), u32(8)])
  const ifd0 = Buffer.concat([
    u16(2),
    entry(0x010f, 2, 8, u32(38)),
    entry(0x8825, 4, 1, u32(46)),
    u32(148),
  ])
  const make = Buffer.from('Fixture\0')
  const gps = Buffer.concat([
    u16(4),
    entry(0x0001, 2, 2, Buffer.from('N\0\0\0')),
    entry(0x0002, 5, 3, u32(100)),
    entry(0x0003, 2, 2, Buffer.from('W\0\0\0')),
    entry(0x0004, 5, 3, u32(124)),
    u32(0),
  ])
  const ifd1 = Buffer.concat([
    u16(2),
    entry(0x0201, 4, 1, u32(178)),
    entry(0x0202, 4, 1, u32(thumbnail.length)),
    u32(0),
  ])
  return Buffer.concat([header, ifd0, make, gps, lat, lon, ifd1, thumbnail])
}

async function sitePhoto(): Promise<Buffer> {
  const main = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 60, g: 110, b: 170 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
  const thumbnail = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .jpeg()
    .toBuffer()
  const tiff = exifWithThumbnail(thumbnail)
  const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff])
  const length = Buffer.from([((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), length, body])
  return Buffer.concat([main.subarray(0, 2), app1, main.subarray(2)])
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(path.join(OUT, 'letter.pdf'), await letter())
  writeFileSync(path.join(OUT, 'scanned-with-ocr.pdf'), await scannedWithOcr())
  writeFileSync(path.join(OUT, 'site-photo.jpg'), await sitePhoto())
}

await main()
