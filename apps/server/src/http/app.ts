import path from 'node:path';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { createRequestGuard, type RequestGuardOptions } from './request-guard.js';

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
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  if (clientDist) {
    app.use(
      '/assets',
      express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '30d' }),
    );
    app.use(express.static(clientDist, { index: false, maxAge: 0 }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
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
