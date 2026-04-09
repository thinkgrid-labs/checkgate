import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/checkgate/',
  ignoreDeadLinks: [/^http:\/\/localhost/],
  title: 'Checkgate',
  description:
    'Open-source self-hosted feature flag engine with sub-microsecond local evaluation. Native SDKs for Node.js, React Native, Flutter, and browsers via WebAssembly.',

  head: [
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Checkgate — Self-Hosted Feature Flag Engine' }],
    ['meta', {
      name: 'og:description',
      content: 'Sub-microsecond feature flag evaluation for Node.js, React Native, Flutter, and browsers. Self-hosted, open-source, no vendor lock-in.',
    }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'SDKs', link: '/sdks/nodejs' },
      { text: 'Self-Hosting', link: '/self-hosting' },
      { text: 'API', link: '/api-reference' },
      {
        text: 'GitHub',
        link: 'https://github.com/ThinkGrid-Labs/checkgate',
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Checkgate?', link: '/guide/what-is-checkgate' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Core Concepts', link: '/guide/concepts' },
        ],
      },
      {
        text: 'SDKs',
        items: [
          { text: 'Node.js (NAPI)', link: '/sdks/nodejs' },
          { text: 'Web (WebAssembly)', link: '/sdks/web' },
          { text: 'React Native (JSI)', link: '/sdks/react-native' },
          { text: 'Flutter (FFI)', link: '/sdks/flutter' },
        ],
      },
      {
        text: 'Self-Hosting',
        items: [
          { text: 'Docker', link: '/self-hosting' },
          { text: 'AWS', link: '/self-hosting#aws' },
          { text: 'Environment Variables', link: '/self-hosting#environment-variables' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'REST API', link: '/api-reference' },
          { text: 'Flag Schema', link: '/api-reference#flag-schema' },
          { text: 'SSE Stream', link: '/api-reference#sse-stream' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ThinkGrid-Labs/checkgate' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 ThinkGrid Labs',
    },

    search: {
      provider: 'local',
    },
  },
})
