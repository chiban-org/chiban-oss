const REFERENCE = /^CP-\d{4}-\d{4,}$/

export default async function ReceivedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const { ref } = await searchParams
  const reference = typeof ref === 'string' && REFERENCE.test(ref) ? ref : null
  return (
    <>
      <h1>Report received</h1>
      <p className="max-w-prose text-base">
        Report received.{reference === null ? '' : ` Reference ${reference}.`} The town does not
        know who sent it, so it cannot reply to you.
      </p>
    </>
  )
}
