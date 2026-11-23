export const HEARING_NOTICE_TEXT =
  '{{town.name}}\n\n{{notice.recipientName}}\n\n{{notice.recipientAddress}}\n\nNotice of {{hearing.kind}} to {{notice.recipientName}}.\n\nThe {{board.name}} will hold a {{hearing.kind}} on {{meeting.date}} at {{meeting.time}}, {{meeting.location}}, on {{application.typeLabel}} {{application.number}}, {{project.title}}, parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Applicant {{party.applicant.name}}.\n\nThis notice is mailed to abutters and other parties entitled to notice, and is posted on the Town website and bulletin boards. The application is available for inspection at the town offices.'

export const NOTICE_OF_DECISION_TEXT =
  '{{town.name}}\n\nNotice of decision of the {{board.name}} on {{application.typeLabel}} {{application.number}}, {{project.title}}, parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Applicant {{party.applicant.name}}.\n\nDecision: {{decision.outcome}}, voted {{decision.votedOn}}.\n\nFindings of fact: {{decision.findings}}\n\n{{decision.conditionsSection}}\n\n{{decision.reasonsSection}}\n\n{{decision.appealRights}}'

export const DECISION_LETTER_TEXT =
  '{{town.name}}\n\nDear {{party.applicant.name}}:\n\nOn {{decision.votedOn}} the {{board.name}} voted on {{application.typeLabel}} {{application.number}} for {{parcel.siteAddress}}. The decision is: {{decision.outcome}}.\n\nFindings of fact: {{decision.findings}}\n\n{{decision.conditionsSection}}\n\n{{decision.reasonsSection}}\n\n{{decision.appealRights}}'
