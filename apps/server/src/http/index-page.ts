import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Meta tags whose root-relative URL link-preview crawlers only accept in absolute form. */
const ABSOLUTE_URL_META =
  /(<meta\s+(?:property|name)="(?:og:url|og:image|twitter:image)"\s+content=")\/(?!\/)/g;

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The client's index.html, with share-preview URLs made absolute for the origin the player opened.
 * Facebook, LinkedIn and others ignore a relative og:image, and the public origin of a LAN game is
 * only known per request (an IP, the machine's name, or a proxy's host).
 */
export function createIndexPage(clientDist: string): (origin: string) => string {
  const html = readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  return (origin) =>
    html.replace(ABSOLUTE_URL_META, (_match, head: string) => `${head}${escapeAttribute(origin)}/`);
}
