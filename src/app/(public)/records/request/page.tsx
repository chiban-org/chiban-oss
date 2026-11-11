import type { Metadata } from 'next'
import { RecordsRequestForm } from './RecordsRequestForm'

export const metadata: Metadata = { title: 'Ask for town records' }

export default function RecordsRequestPage() {
  return (
    <main>
      <h1>Ask for town records</h1>
      <p className="max-w-prose">
        Anyone can ask to see or get copies of the public records the town keeps. You do not need an
        account. Tell the town what you are looking for and where to send the answer.
      </p>
      <RecordsRequestForm />
    </main>
  )
}
