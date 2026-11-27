import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Meta tags whose root-relative URL link-preview crawlers only accept in absolute form. */
const ABSOLUTE_URL_META =
  /(<meta\s+(?:property|name)="(?:og:url|og:image|twitter:image)"\s+content=")\/(?!\/)/g;

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** What crawlers that don't run scripts read on a missing page; React replaces it on first render. */
const NOT_FOUND_SUMMARY =
  '<div id="root">\n      <main>\n        <h1>Page not found</h1>\n' +
  '        <p>There is nothing at this address. <a href="/">Play UNO No Mercy</a> instead.</p>\n' +
  '      </main>\n    </div>\n  </body>';

/**
 * The page for an address that doesn't exist: the same app, flagged so the client draws its 404
 * screen, with a noindex robots tag, its own title and no canonical link.
 */
function toNotFoundPage(html: string): string {
  return html
    .replace(/<html([^>]*)>/, '<html$1 data-page="not-found">')
    .replace(/<title>[^<]*<\/title>/, '<title>Page not found - UNO No Mercy</title>')
    .replace(/<meta\s+name="robots"[^>]*>/, '<meta name="robots" content="noindex" />')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/, '')
    .replace(/<div id="root">[\s\S]*<\/div>\s*<\/body>/, NOT_FOUND_SUMMARY);
}

/**
 * The client's index.html, with share-preview URLs made absolute for the origin the player opened.
 * Facebook, LinkedIn and others ignore a relative og:image, and the public origin of a LAN game is
 * only known per request (an IP, the machine's name, or a proxy's host).
 */
export function createIndexPage(
  clientDist: string,
): (origin: string, page?: 'game' | 'notFound') => string {
  const game = readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  const notFound = toNotFoundPage(game);
  return (origin, page = 'game') =>
    (page === 'game' ? game : notFound).replace(
      ABSOLUTE_URL_META,
      (_match, head: string) => `${head}${escapeAttribute(origin)}/`,
    );
}
