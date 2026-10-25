// The Jekyll site served post images at /assets/images/posts/<yyyy-mm-dd>-<slug>/<file>.
// They now live in src/assets/posts/<slug>/ (optimised for the essay pages); this keeps the old URLs.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import type { APIRoute, GetStaticPaths } from 'astro';
import { getItems, isNative, isoDate } from '../../../../lib/items';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export const getStaticPaths = (async () => {
  const items = await getItems();
  return items
    .filter((item) => isNative(item) && item.data.legacy_path && existsSync(`src/assets/posts/${item.id}`))
    .flatMap((item) =>
      readdirSync(`src/assets/posts/${item.id}`)
        .filter((name) => name.split('.').pop()!.toLowerCase() in TYPES)
        .map((name) => ({
          params: { file: `${isoDate(item.data.date)}-${item.id}/${name}` },
          props: { source: `src/assets/posts/${item.id}/${name}` },
        })),
    );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ source: string }> = ({ props }) =>
  new Response(readFileSync(props.source), { headers: { 'Content-Type': TYPES[props.source.split('.').pop()!.toLowerCase()] } });
