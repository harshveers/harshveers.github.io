import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';
import YAML from 'yaml';

const isTodo = (v: unknown) => typeof v === 'string' && /^\s*TODO/.test(v);

const schema = z
  .object({
    headline: z.string(),
    profile_headline: z.string(),
    tagline: z.string(),
    focus: z.string(),
    country: z.string(),
    focus_areas: z.array(z.object({ title: z.string(), line: z.string() }).strict()).min(3).max(4),
    bio: z.string(),
    socials: z
      .object({ email: z.string(), linkedin: z.string(), x: z.string(), github: z.string() })
      .strict(),
    headshot: z.string(),
  })
  .strict();

const raw = schema.parse(YAML.parse(readFileSync('src/data/site.yaml', 'utf8')));

const todos: string[] = [];
const walk = (v: unknown, path: string) => {
  if (isTodo(v)) todos.push(path);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
};
walk(raw, '');
if (todos.length) console.warn(`site.yaml: TODO placeholders, left off the site: ${todos.join(', ')}`);

const real = (v: string) => (isTodo(v) ? undefined : v);

export const SITE_URL = 'https://harshveer.me';

export const site = {
  ...raw,
  profile_headline: real(raw.profile_headline),
  tagline: real(raw.tagline),
  focus: real(raw.focus),
  bio: real(raw.bio),
};

// Links in the order the design shows them. A TODO social is left out.
const { email, linkedin, x, github } = raw.socials;
type Link = { label: string; href: string; external: boolean };
const link = (value: string, label: string, href: string, external = true): Link | undefined =>
  real(value) ? { label, href, external } : undefined;

export const socials = {
  email: link(email, 'Email', `mailto:${email}`, false),
  linkedin: link(linkedin, 'LinkedIn', `https://www.linkedin.com/in/${linkedin}/`),
  x: link(x, 'X', `https://x.com/${x}`),
  github: link(github, 'GitHub', `https://github.com/${github}`),
};
export const xHandle = real(x);

const present = (l: Link | undefined): l is Link => !!l;
export const contactLinks: Link[] = [socials.email, socials.linkedin, socials.x].filter(present);
export const profileUrls: string[] = [socials.linkedin, socials.x, socials.github].filter(present).map((l) => l.href);
export const rssLink: Link = { label: 'RSS', href: '/rss.xml', external: false };
