// A redirect page at each essay's old Jekyll URL (its legacy_path). GitHub Pages also serves
// "/a/b.html" at "/a/b", so the extensionless form of each old URL resolves too.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getItems, isNative, itemPath } from '../lib/items';
import { SITE_URL } from '../lib/site';

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

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export const GET: APIRoute<{ to: string; title: string }> = ({ props }) => {
  const url = new URL(props.to, SITE_URL).href;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(props.title)}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${props.to}">
</head>
<body>
<p>This post has moved to <a href="${props.to}">${escape(props.title)}</a>.</p>
</body>
</html>
`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
