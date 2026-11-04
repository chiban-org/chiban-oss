import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import sharp from 'sharp'
import { buildFrame, type DocumentFrame, type FrameImage } from '@/features/pdf/frame'
import { TOWN_PROFILE_SKELETON, type TownProfileBody } from '@/features/town/profileSchema'

export const LOGO_KEY = `town-assets/${'c'.repeat(64)}`
export const SIGNATURE_KEY = `town-assets/${'d'.repeat(64)}`

export async function pngBytes(width: number, height: number): Promise<Uint8Array> {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 60, b: 120 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(bytes)
}

export async function pngImage(width: number, height: number): Promise<FrameImage> {
  return { bytes: await pngBytes(width, height), contentType: 'image/png', width, height }
}

export const PROFILE: TownProfileBody = {
  ...TOWN_PROFILE_SKELETON,
  officeName: 'Land Use Office',
  addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
  phone: '603-555-0100',
  email: 'landuse@alderpond.example',
  logo: { objectKey: LOGO_KEY, contentType: 'image/png', width: 120, height: 120 },
  letterhead: { ...TOWN_PROFILE_SKELETON.letterhead, footerText: 'Keep this permit on site.' },
  signers: [
    {
      role: 'building_official',
      name: 'Ira Inspector',
      title: 'Building Official',
      signature: { objectKey: SIGNATURE_KEY, contentType: 'image/png', width: 300, height: 90 },
    },
    { role: 'town_clerk', name: 'Sam Clerk', title: 'Town Clerk', signature: null },
  ],
}

export async function profileFrame(withImages = true): Promise<DocumentFrame> {
  const images = withImages
    ? new Map([
        [LOGO_KEY, await pngImage(120, 120)],
        [SIGNATURE_KEY, await pngImage(300, 90)],
      ])
    : new Map<string, FrameImage>()
  return buildFrame('Town of Alder Pond', PROFILE, undefined, images)
}

function isImage(object: unknown): boolean {
  return (
    object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
  )
}

export async function imageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes)
  return doc.context.enumerateIndirectObjects().filter(([, object]) => isImage(object)).length
}
