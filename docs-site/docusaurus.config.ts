import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'
import { themes as prismThemes } from 'prism-react-renderer'

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
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
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
