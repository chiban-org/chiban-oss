interface EnrollmentDetailsProps {
  uri: string
  qr: string
}

const GROUP_SIZE = 4

function secretOf(uri: string): string {
  return new URL(uri).searchParams.get('secret') ?? ''
}

function grouped(secret: string): string {
  return secret.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g'))?.join(' ') ?? ''
}

export function EnrollmentDetails({ uri, qr }: EnrollmentDetailsProps) {
  return (
    <div className="flex flex-col gap-3">
      <img src={qr} alt="Scan this QR code with your authenticator app" width={224} height={224} />
      <p>Cannot scan the code? Enter this key in your authenticator app instead.</p>
      <p>
        <code className="break-all text-lg">{grouped(secretOf(uri))}</code>
      </p>
      <p>
        <a href={uri}>Open in your authenticator app</a>
      </p>
    </div>
  )
}
