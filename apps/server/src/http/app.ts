import path from 'node:path';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { createIndexPage } from './index-page.js';
import { createRequestGuard, type RequestGuardOptions } from './request-guard.js';

/** The link-preview image named by og:image and twitter:image in the client's index.html. */
const SHARE_IMAGE_PATH = '/social-card.jpg';

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function httpStatusOf(error: unknown): number {
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

/**
 * HTTP app: serves the production client bundle (all assets local, no CDN) and a health check.
 */
export function createHttpApp(
  clientDist: string | null,
  guardOptions?: RequestGuardOptions,
): Express {
  const app = express();
  const guard = createRequestGuard(guardOptions);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    if (!guard.allowsHost(req)) {
      res.status(421).type('text/plain').send("Open the game by the host machine's IP address.");
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=()',
    );
    res.setHeader(
      'Content-Security-Policy',
      // Google Tag Manager and Google Analytics are the only third-party origins (public/analytics.js).
      "default-src 'self'; connect-src 'self' ws: wss: https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' https://www.googletagmanager.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Search engines read these two; without them the catch-all below answered with the game page.
  app.get('/robots.txt', (req, res) => {
    res
      .type('text/plain')
      .send(`User-agent: *\nAllow: /\n\nSitemap: ${guard.publicOrigin(req)}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    res
      .type('application/xml')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `  <url><loc>${escapeXml(guard.publicOrigin(req))}/</loc></url>\n` +
          '</urlset>\n',
      );
  });

  if (clientDist) {
    const indexPage = createIndexPage(clientDist);
    const sendIndex: RequestHandler = (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexPage(guard.publicOrigin(req)));
    };
    app.use(
      '/assets',
      express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '30d' }),
    );
    app.get('/index.html', sendIndex);
    // WhatsApp and Messenger on the web and desktop load the link-preview image straight from
    // this server inside their own page, which a same-origin resource policy blocks.
    app.get(SHARE_IMAGE_PATH, (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    });
    app.use(express.static(clientDist, { index: false, maxAge: 0 }));
    app.get('/', sendIndex);
    // The game lives at "/" (invites add ?join=CODE). Any other path gets the 404 page, so search
    // engines don't index copies of the home page.
    app.get('*', (req, res) => {
      res.status(404).setHeader('X-Robots-Tag', 'noindex');
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexPage(guard.publicOrigin(req), 'notFound'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text/plain')
        .send(
          'No Mercy LAN server is running, but the client has not been built.\n' +
            'Run "npm run build" for production, or open the Vite dev server (npm run dev).',
        );
    });
  }

  // Express's default handler prints stack traces (and file paths) unless NODE_ENV=production.
  const hideErrors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = httpStatusOf(error);
    if (status >= 500)
      console.error('[http] request failed:', error instanceof Error ? error.message : error);
    const message = status >= 500 ? 'Server error' : status === 404 ? 'Not found' : 'Bad request';
    res.status(status).type('text/plain').send(message);
  };
  app.use(hideErrors);
  return app;
}
