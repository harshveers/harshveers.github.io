// About used to live at /about/; it is now the home page.
import { redirectResponse } from '../../lib/redirect';
import { site } from '../../lib/site';

export const GET = () => redirectResponse('/', site.headline);
