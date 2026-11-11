import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Start here',
      collapsed: false,
      items: ['index', 'start-here/try-the-demo', 'start-here/staff-roles'],
    },
    {
      type: 'category',
      label: 'Moving in your data',
      collapsed: false,
      items: ['moving-in/cama-import', 'moving-in/spreadsheet-migration'],
    },
    {
      type: 'category',
      label: 'Reports and export',
      collapsed: false,
      items: ['reports-and-export/incremental-export', 'reports-and-export/export-format'],
    },
    {
      type: 'category',
      label: 'Self-hosting and operations',
      collapsed: false,
      items: ['operations/self-hosting', 'operations/demo-overlay'],
    },
    {
      type: 'category',
      label: 'State packs',
      collapsed: false,
      items: [
        {
          type: 'category',
          label: 'New Hampshire',
          collapsed: false,
          items: ['state-packs/new-hampshire/starters', 'state-packs/new-hampshire/deadlines'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: false,
      items: ['reference/configuration', 'reference/roles-and-permissions'],
    },
  ],
}

export default sidebars
