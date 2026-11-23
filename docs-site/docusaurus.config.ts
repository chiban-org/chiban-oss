import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'
import { themes as prismThemes } from 'prism-react-renderer'

const productDefinition = 'Chiban is open-source land-use software for small US towns.'
const productSummary =
  'It keeps permits, board hearings, inspections, code enforcement and the public record together, filed under each parcel. Towns run it themselves for free or have MediaArts host it.'

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': 'https://chiban.us/#organization', name: 'MediaArts', url: 'https://chiban.us' },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://chiban.us/#software',
      name: 'Chiban',
      url: 'https://chiban.us',
      description: `${productDefinition} ${productSummary}`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser; self-hosted on Linux with Docker',
      isAccessibleForFree: true,
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      publisher: { '@id': 'https://chiban.us/#organization' },
      sameAs: ['https://github.com/chiban-org/chiban-oss', 'https://docs.chiban.us/'],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://docs.chiban.us/#website',
      name: 'Chiban documentation',
      url: 'https://docs.chiban.us/',
      publisher: { '@id': 'https://chiban.us/#organization' },
      about: { '@id': 'https://chiban.us/#software' },
    },
  ],
}

const config: Config = {
  title: 'Chiban',
  tagline: 'Open-source land-use software for small US towns',
  favicon: 'img/favicon.ico',

  url: 'https://docs.chiban.us',
  baseUrl: '/',
  trailingSlash: true,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',

  markdown: {
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },

  headTags: [
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify(structuredData),
    },
    {
      tagName: 'link',
      attributes: { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'Chiban documentation for language models' },
    },
    {
      tagName: 'script',
      attributes: {
        src: 'https://analytics.ahrefs.com/analytics.js',
        'data-key': 'LoyhhNigw+hWSFZp2ibbHw',
        async: 'true',
      },
    },
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        gtag: {
          trackingID: 'G-T4PEJQFDBT',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      './plugins/llmsTxt/index.ts',
      {
        title: 'Chiban documentation',
        summary: `${productDefinition} ${productSummary}`,
        details: [
          'These docs are written for the people who use Chiban in a town office, the residents and contractors who apply, and the IT staff who run it. The demo town in examples, Alder Pond, is made up.',
          'Product site: https://chiban.us. Source code: https://github.com/chiban-org/chiban-oss.',
        ],
        sections: [
          { folders: ['', 'start-here'], label: 'Start here' },
          { folders: ['guides'], label: 'Guides by role' },
          { folders: ['residents'], label: 'Residents, applicants and contractors' },
          { folders: ['moving-in'], label: 'Moving in your data' },
          { folders: ['reports-and-export'], label: 'Reports and export' },
          { folders: ['operations'], label: 'Self-hosting and operations' },
          { folders: ['state-packs'], label: 'State packs' },
          { folders: ['reference'], label: 'Reference' },
        ],
        links: [
          { label: 'chiban.us', href: 'https://chiban.us', note: 'what Chiban is, the two editions, and how to start a pilot' },
          { label: 'Source code', href: 'https://github.com/chiban-org/chiban-oss', note: 'the full product under the AGPL-3.0 license' },
          { label: 'Demo', href: 'https://demo.chiban.us/demo', note: 'a made-up town with sample records, no sign-up' },
        ],
      },
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    image: 'img/icon.png',
    navbar: {
      title: 'Chiban',
      logo: {
        alt: 'Chiban',
        src: 'img/icon.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://chiban.us',
          label: 'chiban.us',
          position: 'right',
        },
        {
          href: 'https://github.com/chiban-org/chiban-oss',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Start here',
          items: [
            { label: 'What Chiban is', to: '/' },
            { label: 'Try the demo', to: '/start-here/try-the-demo/' },
            { label: 'Staff roles', to: '/start-here/staff-roles/' },
          ],
        },
        {
          title: 'Running Chiban',
          items: [
            { label: 'Self-hosting', to: '/operations/self-hosting/' },
            { label: 'Configuration', to: '/reference/configuration/' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'chiban.us', href: 'https://chiban.us' },
            { label: 'Source code on GitHub', href: 'https://github.com/chiban-org/chiban-oss' },
            { label: 'License (AGPL-3.0)', href: 'https://www.gnu.org/licenses/agpl-3.0.html' },
          ],
        },
      ],
      copyright: 'Chiban is open-source software licensed under the AGPL-3.0.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
