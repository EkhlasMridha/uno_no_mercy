import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  host: string;
  port: number;
  lanMode: boolean;
  dev: boolean;
  reconnectGraceMs: number;
  clientDist: string | null;
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefixed = args.find((a) => a.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

/**
 * Configuration from CLI flags (preferred, cross-platform) or environment variables.
 *   --lan            bind to all interfaces (0.0.0.0) so LAN devices can join
 *   --host <addr>    explicit bind address (overrides --lan)
 *   --port <n>       port (default 3000)
 *   --dev            development mode (card-conservation checks on every move)
 * Env: HOST, PORT, RECONNECT_GRACE_SECONDS, CLIENT_DIST
 */
export function loadConfig(args = process.argv.slice(2), env = process.env): ServerConfig {
  const lanMode = args.includes('--lan') || env.LAN === '1';
  const host = argValue(args, '--host') ?? env.HOST ?? (lanMode ? '0.0.0.0' : '127.0.0.1');
  const port = Number(argValue(args, '--port') ?? env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  const graceSeconds = Number(env.RECONNECT_GRACE_SECONDS ?? 120);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultDist = path.resolve(here, '../../client/dist');
  const clientDist = env.CLIENT_DIST ? path.resolve(env.CLIENT_DIST) : defaultDist;
  return {
    host,
    port,
    lanMode: lanMode || host === '0.0.0.0',
    dev: args.includes('--dev') || env.NODE_ENV === 'development',
    reconnectGraceMs: Math.max(10, Number.isFinite(graceSeconds) ? graceSeconds : 120) * 1000,
    clientDist: existsSync(path.join(clientDist, 'index.html')) ? clientDist : null,
  };
}
