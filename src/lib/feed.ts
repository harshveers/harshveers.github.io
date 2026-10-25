import rss from '@astrojs/rss';
import { getItems, itemHref, pillLabel } from './items';
import { site, SITE_URL } from './site';

// RSS of every item. Essays link to their page here; everything else links out.
export async function feedResponse(selfPath: string) {
  const items = await getItems();
  return rss({
    title: `${site.headline}: writing & appearances`,
    description: site.tagline ?? site.headline,
    site: SITE_URL,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>en</language><atom:link href="${SITE_URL}${selfPath}" rel="self" type="application/rss+xml"/>`,
    items: items.map((item) => ({
      title: item.data.title,
      link: new URL(itemHref(item), SITE_URL).href,
      pubDate: item.data.date,
      description: item.data.excerpt,
      categories: [pillLabel(item), ...(item.data.tags ?? [])],
    })),
  });
}
