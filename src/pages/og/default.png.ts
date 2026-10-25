import { defaultOgImage } from '../../lib/og';
import { currentCompany, currentRole } from '../../lib/resume';

export async function GET() {
  const png = await defaultOgImage(`${currentRole.title}, ${currentCompany.company}`);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
