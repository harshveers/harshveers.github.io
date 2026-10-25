import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://harshveer.me',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: {
    // Code blocks are styled with the site's tokens (HANDOFF.md §8), not a highlighter theme.
    syntaxHighlight: false,
  },
  integrations: [
    sitemap({
      // Only real pages: not the 404 or the redirect pages at old Jekyll URLs.
      filter: (page) => !page.endsWith('/404/') && !page.endsWith('.html'),
    }),
  ],
});
