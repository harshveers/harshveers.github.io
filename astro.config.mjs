import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';

// Links in essays that leave the site open in a new tab, like every other outside link.
const externalLinksInNewTab = {
  name: 'external-links-in-new-tab',
  element: {
    filter: ['a'],
    visit(node, ctx) {
      const href = String(node.properties?.href ?? '');
      if (!/^https?:\/\//.test(href) || href.startsWith('https://harshveer.me')) return;
      ctx.setProperty(node, 'target', '_blank');
      ctx.setProperty(node, 'rel', ['noopener']);
      ctx.appendChild(node, {
        type: 'element',
        tagName: 'span',
        properties: { className: ['sr-only'] },
        children: [{ type: 'text', value: ' (opens in a new tab)' }],
      });
    },
  },
};

export default defineConfig({
  site: 'https://harshveer.me',
  output: 'static',
  trailingSlash: 'always',
  // CSS is inlined into each page: a page cached from an earlier deploy then can't point at a
  // stylesheet that no longer exists (hashed file names change on every deploy).
  build: { format: 'directory', inlineStylesheets: 'always' },
  markdown: {
    processor: satteri({ hastPlugins: [externalLinksInNewTab] }),
    // Code blocks are styled with the site's tokens (HANDOFF.md §8), not a highlighter theme.
    syntaxHighlight: false,
  },
  integrations: [
    sitemap({
      // Only real pages: not the 404 or the redirect pages at old URLs.
      filter: (page) => !page.endsWith('/404/') && !page.endsWith('/about/') && !page.endsWith('.html'),
    }),
  ],
});
