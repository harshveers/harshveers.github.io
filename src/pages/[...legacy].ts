// A redirect page at each essay's old Jekyll URL (its legacy_path). GitHub Pages also serves
// "/a/b.html" at "/a/b", so the extensionless form of each old URL resolves too.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getItems, isNative, itemPath } from '../lib/items';
import { redirectResponse } from '../lib/redirect';

export const getStaticPaths = (async () => {
  const items = await getItems();
  return items
    .filter((item) => isNative(item) && item.data.legacy_path)
    .map((item) => {
      const legacy = item.data.legacy_path!.replace(/^\//, '');
      if (!legacy.endsWith('.html')) throw new Error(`${item.id}: legacy_path must end in .html (got /${legacy})`);
      return { params: { legacy }, props: { to: itemPath(item), title: item.data.title } };
    });
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ to: string; title: string }> = ({ props }) => redirectResponse(props.to, props.title, 'This post has moved to');
