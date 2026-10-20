import path from 'node:path';
import express, { type Express } from 'express';

/**
 * HTTP app: serves the production client bundle (all assets local, no CDN) and a health check.
 */
export function createHttpApp(clientDist: string | null): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
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
  return app;
}
