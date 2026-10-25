// Open Graph images (1200×630), rendered at build time with satori + resvg (HANDOFF.md §8).
import { readFileSync, existsSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { site } from './site';

const font = (pkg: string, file: string) => readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`);
const fonts = [
  { name: 'Source Serif 4', data: font('source-serif-4', 'source-serif-4-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const },
  { name: 'Source Serif 4', data: font('source-serif-4', 'source-serif-4-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Inter', data: font('inter', 'inter-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const },
  { name: 'Inter', data: font('inter', 'inter-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const },
];

// Light-theme tokens: OG images are always shown on the viewer's platform, not in our theme.
const C = { bg: '#FFFFFF', ink: '#1A1A1A', ink2: '#555B63', ink3: '#6B7178', accent: '#004F90', onAccent: '#FFFFFF', rule: '#ECECEC' };

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown; [k: string]: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
});

const monogram = (size: number) =>
  h(
    'div',
    {
      width: size,
      height: size,
      borderRadius: size * 0.26,
      background: C.accent,
      color: C.onAccent,
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Source Serif 4',
      fontWeight: 600,
      fontSize: size * 0.44,
    },
    'HS',
  );

let headshotUri: string | null | undefined;
async function headshotDataUri() {
  if (headshotUri !== undefined) return headshotUri;
  headshotUri = existsSync(site.headshot)
    ? `data:image/jpeg;base64,${(await sharp(site.headshot).resize(480, 480, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()).toString('base64')}`
    : null;
  return headshotUri;
}

async function toPng(tree: Node) {
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

const frame = (...children: Node[]) =>
  h(
    'div',
    { width: 1200, height: 630, boxSizing: 'border-box', background: C.bg, borderTop: `3px solid ${C.accent}`, padding: '72px 88px', fontFamily: 'Inter', color: C.ink },
    ...children,
  );

export async function defaultOgImage(role: string) {
  const photo = await headshotDataUri();
  return toPng(
    frame(
      h(
        'div',
        { flex: 1, flexDirection: 'column', justifyContent: 'space-between' },
        monogram(84),
        h(
          'div',
          { flexDirection: 'column' },
          h('div', { fontFamily: 'Source Serif 4', fontWeight: 500, fontSize: 72, letterSpacing: '-0.015em', lineHeight: 1.1 }, site.headline),
          h('div', { marginTop: 16, fontSize: 32, color: C.ink2 }, role),
        ),
        h('div', { fontSize: 24, color: C.ink3 }, 'harshveer.me'),
      ),
      ...(photo
        ? [
            h(
              'div',
              { alignItems: 'center' },
              { type: 'img', props: { src: photo, width: 240, height: 240, style: { borderRadius: 120, border: `6px solid ${C.rule}` } } },
            ),
          ]
        : []),
    ),
  );
}

export async function articleOgImage(title: string, date: string) {
  const size = title.length > 70 ? 54 : 64;
  return toPng(
    frame(
      h(
        'div',
        { flex: 1, flexDirection: 'column', justifyContent: 'space-between' },
        h('div', { alignItems: 'center', gap: 20 }, monogram(64), h('div', { fontSize: 28, fontWeight: 500 }, site.headline)),
        h(
          'div',
          { fontFamily: 'Source Serif 4', fontWeight: 500, fontSize: size, lineHeight: 1.15, letterSpacing: '-0.015em', maxHeight: size * 1.15 * 3, overflow: 'hidden' },
          title,
        ),
        h('div', { fontSize: 24, color: C.ink3 }, `${date} · harshveer.me`),
      ),
    ),
  );
}
