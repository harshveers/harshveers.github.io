import type { APIRoute, GetStaticPaths } from 'astro';
import { getItems, isNative, longDate, type Item } from '../../lib/items';
import { articleOgImage } from '../../lib/og';

export const getStaticPaths = (async () => {
  const items = await getItems();
  return items.filter(isNative).map((item) => ({ params: { slug: item.id }, props: { item } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ item: Item }> = async ({ props }) => {
  const png = await articleOgImage(props.item.data.title, longDate(props.item.data.date));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
