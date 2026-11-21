const STATUTES = 'https://legislature.maine.gov/statutes'

export const ME_URLS = {
  title1sec402: `${STATUTES}/1/title1sec402.html`,
  title1sec408A: `${STATUTES}/1/title1sec408-A.html`,
  title10sec9724: `${STATUTES}/10/title10sec9724.html`,
  title30Asec4103: `${STATUTES}/30-A/title30-Asec4103.html`,
  title30Asec4403: `${STATUTES}/30-A/title30-Asec4403.html`,
  mubecStandards:
    'https://www.maine.gov/dps/fmo/sites/maine.gov.dps.fmo/files/inline-files/MUBEC%20Standards%20and%20Amendments.pdf',
  rulesAdopted2018: 'https://legislature.maine.gov/doc/2687',
  retentionIntroduction:
    'https://www1.maine.gov/sos/sites/maine.gov.sos/files/content/assets/LGintroduction.may2024v1.pdf',
  retentionSectionA:
    'https://www1.maine.gov/sos/sites/maine.gov.sos/files/content/assets/LGSectionA.may2024v1.pdf',
} as const

export const TOWN_RULE = { label: 'Town rule', url: null } as const
