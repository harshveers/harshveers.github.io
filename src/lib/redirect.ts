import { SITE_URL } from './site';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** A valid, noindexed HTML page that sends visitors (and search engines, via canonical) to `to`. */
export function redirectResponse(to: string, title: string, message = 'This page has moved to') {
  const url = new URL(to, SITE_URL).href;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${to}">
</head>
<body>
<p>${message} <a href="${to}">${escape(title)}</a>.</p>
</body>
</html>
`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
