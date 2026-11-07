import type {
  Letterhead,
  SignerRole,
  TownImageType,
  TownProfileBody,
} from '@/features/town/profileSchema'

export interface FrameImage {
  bytes: Uint8Array
  contentType: TownImageType
  width: number
  height: number
}

export interface FrameSigner {
  role: SignerRole
  name: string
  title: string
  signature: FrameImage | null
}

export interface FrameContact {
  address: string
  phone: string
  email: string
  website: string
  officeHours: string
}

interface FrameData {
  townName: string
  officeName: string
  contact: FrameContact
  headerLines: string[]
  footerText: string
  pageNumbers: boolean
  logo: FrameImage | null
  logoPosition: Letterhead['logoPosition']
  signers: FrameSigner[]
}

declare const frameBrand: unique symbol

export type DocumentFrame = Readonly<FrameData> & { readonly [frameBrand]: true }

export type FrameImages = ReadonlyMap<string, FrameImage>

const NO_CONTACT: FrameContact = { address: '', phone: '', email: '', website: '', officeHours: '' }

function brand(data: FrameData): DocumentFrame {
  return data as DocumentFrame
}

export function plainFrame(townName: string): DocumentFrame {
  return brand({
    townName,
    officeName: '',
    contact: NO_CONTACT,
    headerLines: [],
    footerText: '',
    pageNumbers: true,
    logo: null,
    logoPosition: 'left',
    signers: [],
  })
}

const SEPARATOR = '  ·  '

function headerLinesOf(contact: FrameContact, letterhead: Letterhead): string[] {
  const shown = letterhead.contactLines
  const reach = [
    shown.phone && contact.phone !== '' ? `Phone ${contact.phone}` : '',
    shown.email ? contact.email : '',
    shown.website ? contact.website : '',
  ].filter((part) => part !== '')
  return [
    shown.address ? contact.address : '',
    reach.join(SEPARATOR),
    shown.officeHours && contact.officeHours !== '' ? `Office hours: ${contact.officeHours}` : '',
  ].filter((line) => line !== '')
}

function imageOf(images: FrameImages, key: string | undefined): FrameImage | null {
  return key === undefined ? null : (images.get(key) ?? null)
}

export function buildFrame(
  townName: string,
  profile: TownProfileBody | null,
  boardId: string | undefined,
  images: FrameImages,
): DocumentFrame {
  if (profile === null) return plainFrame(townName)
  const override =
    boardId === undefined ? undefined : new Map(Object.entries(profile.boardOverrides)).get(boardId)
  const addressLines =
    override?.addressLines !== undefined && override.addressLines.length > 0
      ? override.addressLines
      : profile.addressLines
  const contact: FrameContact = {
    address: addressLines.join(', '),
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    officeHours: profile.officeHours,
  }
  const officeName =
    override?.officeName !== undefined && override.officeName !== ''
      ? override.officeName
      : profile.officeName
  const footerText =
    override?.footerText !== undefined && override.footerText !== ''
      ? override.footerText
      : profile.letterhead.footerText
  return brand({
    townName,
    officeName,
    contact,
    headerLines: headerLinesOf(contact, profile.letterhead),
    footerText,
    pageNumbers: profile.letterhead.pageNumbers,
    logo: imageOf(images, profile.logo?.objectKey),
    logoPosition: profile.letterhead.logoPosition,
    signers: profile.signers.map((s) => ({
      role: s.role,
      name: s.name,
      title: s.title,
      signature: imageOf(images, s.signature?.objectKey),
    })),
  })
}

export function signerFor(frame: DocumentFrame, role: SignerRole): FrameSigner | null {
  return frame.signers.find((s) => s.role === role) ?? null
}
