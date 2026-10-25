import { getCollection, type CollectionEntry } from 'astro:content';

export type Item = CollectionEntry<'items'>;

const KIND_LABELS: Record<Item['data']['kind'], string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  youtube: 'YouTube',
  webinar: 'Webinar',
  whitepaper: 'Whitepaper',
  podcast: 'Podcast',
  talk: 'Talk',
  article: 'Article',
  essay: 'Essay',
};

/** All items, newest first. Fails the build if a file name's date disagrees with its `date`. */
export async function getItems(): Promise<Item[]> {
  const items = await getCollection('items');
  for (const item of items) {
    const fileDate = item.filePath?.match(/(\d{4}-\d{2}-\d{2})-[^/]+\.md$/)?.[1];
    const date = item.data.date.toISOString().slice(0, 10);
    if (fileDate !== date) throw new Error(`${item.filePath}: date ${date} does not match the file name`);
  }
  return items.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

export const isNative = (item: Item) => item.data.kind === 'essay';
export const isArchive = (item: Item) => item.data.tags?.includes('archive') ?? false;

export const itemPath = (item: Item) => `/writing/${item.id}/`;
export const itemHref = (item: Item) => (isNative(item) ? itemPath(item) : item.data.url!);

/** The source pill: "LinkedIn", "Elucidata webinar", "Essay · Ubuntu". */
export function pillLabel(item: Item): string {
  const kind = KIND_LABELS[item.data.kind];
  if (item.data.source_name) return `${item.data.source_name} ${kind.toLowerCase()}`;
  const topic = isNative(item) ? item.data.tags?.find((t) => t !== 'archive') : undefined;
  return topic ? `${kind} · ${topic[0].toUpperCase()}${topic.slice(1)}` : kind;
}

export function groupByYear(items: Item[]): { year: number; items: Item[] }[] {
  const groups = new Map<number, Item[]>();
  for (const item of items) {
    const year = item.data.date.getUTCFullYear();
    groups.set(year, [...(groups.get(year) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => b - a).map(([year, items]) => ({ year, items }));
}

// Dates are calendar days: always format in UTC so the day never shifts.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "24 Oct". Fixed abbreviations: newer ICU versions print "Sept". */
export const shortDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
export const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const readingMinutes = (markdown: string) => Math.max(1, Math.round(markdown.split(/\s+/).filter(Boolean).length / 230));
