import { feedResponse } from '../lib/feed';

export const GET = () => feedResponse('/rss.xml');
