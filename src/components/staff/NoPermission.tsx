export function NoPermission({ title, action }: { title: string; action: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p role="alert">{`You do not have permission to ${action}.`}</p>
    </main>
  )
}
