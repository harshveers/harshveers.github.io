import { existsSync } from 'node:fs';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const KINDS = ['linkedin', 'x', 'youtube', 'webinar', 'whitepaper', 'podcast', 'talk', 'article', 'essay'] as const;

const FILENAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

// Every feed entry, one file each: src/content/items/<yyyy-mm-dd>-<slug>.md.
// Essays have a body and their own page; everything else links out.
const items = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: './src/content/items',
    generateId: ({ entry }) => {
      const m = FILENAME.exec(entry);
      if (!m) throw new Error(`src/content/items/${entry}: file name must be <yyyy-mm-dd>-<slug>.md (lower-case slug)`);
      return m[2];
    },
  }),
  schema: z
    .object({
      kind: z.enum(KINDS),
      title: z.string().trim().min(1),
      date: z.coerce.date(),
      url: z.url({ protocol: /^https?$/ }).optional(),
      excerpt: z.string().trim().min(40).max(320),
      image: z
        .string()
        .regex(/^src\/assets\/items\/[^/]+\.(jpe?g|png|webp|avif)$/, 'image must be a file under src/assets/items/ (never a remote URL)')
        .refine((p) => existsSync(p), { message: 'image file does not exist' })
        .optional(),
      source_name: z.string().trim().min(1).optional(),
      tags: z.array(z.string().trim().min(1)).optional(),
      featured: z.boolean().default(false),
      legacy_path: z
        .string()
        .regex(/^\/[^\s?#]*$/, 'legacy_path must be an absolute path')
        .optional(),
    })
    .strict()
    .superRefine((item, ctx) => {
      if (item.kind === 'essay' && item.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'essays are native pages: url is not allowed' });
      }
      if (item.kind !== 'essay' && !item.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: `url is required for kind "${item.kind}"` });
      }
      if (item.kind !== 'essay' && item.legacy_path) {
        ctx.addIssue({ code: 'custom', path: ['legacy_path'], message: 'legacy_path only applies to essays' });
      }
    }),
});

export const collections = { items };
