export const NOTICE_CHANNELS = [
  'verified_mail',
  'certified_mail',
  'first_class_mail',
  'newspaper',
  'public_posting',
  'website',
  'bulletin_board',
] as const

export type NoticeChannel = (typeof NOTICE_CHANNELS)[number]

export const NOTICE_CHANNEL_LABELS: Record<NoticeChannel, string> = {
  verified_mail: 'Verified mail',
  certified_mail: 'Certified mail',
  first_class_mail: 'First class mail',
  newspaper: 'Newspaper',
  public_posting: 'Public posting',
  website: 'Town website',
  bulletin_board: 'Bulletin board',
}
