// The Jekyll site's feed lived here; subscribers keep receiving the same items as /rss.xml.
import { feedResponse } from '../lib/feed';

export const GET = () => feedResponse('/feed.xml');
