import { DEMO_DOMAIN } from '@/features/demo/domain'

export interface DemoPersona {
  email: string
  role: string
  summary: string
  kind: 'staff' | 'public'
  home: string
}

export const DEMO_PATH = '/demo'

const demo = (local: string) => `${local}@${DEMO_DOMAIN}`

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    email: demo('staff'),
    role: 'Clerk at the counter',
    summary: 'Takes in applications and payments, issues permits and answers questions.',
    kind: 'staff',
    home: '/staff',
  },
  {
    email: demo('inspector'),
    role: 'Building inspector',
    summary: 'Works the day of inspections, records results and follows up on code cases.',
    kind: 'staff',
    home: '/staff',
  },
  {
    email: demo('finance'),
    role: 'Finance clerk',
    summary: 'Collects payments, runs the money reports and corrects entries in the ledger.',
    kind: 'staff',
    home: '/staff',
  },
  {
    email: demo('records'),
    role: 'Town records custodian',
    summary: 'Answers Right-to-Know requests, redacts records and manages holds and retention.',
    kind: 'staff',
    home: '/staff',
  },
  {
    email: demo('reviewer'),
    role: 'Departmental reviewer',
    summary: 'Reviews the applications sent to the department and records comments.',
    kind: 'staff',
    home: '/staff',
  },
  {
    email: demo('pb.member'),
    role: 'Planning Board member',
    summary: 'Reads the meeting packet and the applications in front of the Planning Board.',
    kind: 'public',
    home: '/board',
  },
  {
    email: demo('zba.member'),
    role: 'Zoning Board member',
    summary: 'Reads the packet for the appeals and variances before the Zoning Board.',
    kind: 'public',
    home: '/board',
  },
  {
    email: demo('applicant'),
    role: 'Applicant',
    summary: 'Applies for a permit online, adds documents, pays fees and follows the review.',
    kind: 'public',
    home: '/portal',
  },
  {
    email: demo('contractor'),
    role: 'Contractor',
    summary: 'Sees the projects that name the contractor and asks for inspections.',
    kind: 'public',
    home: '/portal/contractor',
  },
  {
    email: demo('admin'),
    role: 'Administrator',
    summary:
      'Sets up forms, fees, boards and staff. Changes that would affect every visitor are off.',
    kind: 'staff',
    home: '/staff',
  },
]

export function personaFor(email: unknown): DemoPersona | null {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  return DEMO_PERSONAS.find((p) => p.email === normalized) ?? null
}
