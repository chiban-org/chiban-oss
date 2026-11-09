import type { OfficeContact } from '@/features/boards/officeContact'

export function OfficeContactLine({ contact }: { contact: OfficeContact }) {
  const { officeName, phone, email } = contact
  if (phone === null && email === null) {
    return <p>{`Questions go to the ${officeName} at the town hall.`}</p>
  }
  return (
    <p>
      {`Questions go to the ${officeName}`}
      {phone === null ? null : (
        <>
          {': '}
          <a href={`tel:${phone.replaceAll(/[^\d+]/g, '')}`}>{phone}</a>
        </>
      )}
      {email === null ? null : (
        <>
          {phone === null ? ': ' : ' or '}
          <a href={`mailto:${email}`}>{email}</a>
        </>
      )}
      .
    </p>
  )
}
